import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API_BASE_URL from '../config';
import Layout from '../components/Layout';
import { TrendingUp, Users, Package, AlertTriangle, CheckCircle, XCircle, Clock, Upload, Plus, Trash2, ClipboardList, FileText } from 'lucide-react';
import jsPDF from 'jspdf';

const StatCard = ({ title, value, icon: Icon, color }) => (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
        <div>
            <p className="text-sm font-medium text-gray-500">{title}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`p-3 rounded-full ${color}`}>
            <Icon className="h-6 w-6 text-white" />
        </div>
    </div>
);

const OwnerDashboard = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('packing');
    const [packingData, setPackingData] = useState([]);
    const [items, setItems] = useState([]);
    const [parties, setParties] = useState([]);
    const [dateRange, setDateRange] = useState({ start: '', end: '' });

    // Bills State
    const [bills, setBills] = useState([]);
    const [selectedBill, setSelectedBill] = useState(null); // For View Modal

    // Party Form State
    const [newParty, setNewParty] = useState({ name: '', station: '', mobile: '' });

    useEffect(() => {
        // Fetch Packing Data
        const fetchPacking = async () => {
            try {
                let url = `${API_BASE_URL}/api/packing`;
                const params = new URLSearchParams();

                // Date Logic: Send ISO strings for Local Start/End of Day
                if (dateRange.start) {
                    const start = new Date(dateRange.start);
                    start.setHours(0, 0, 0, 0);
                    params.append('startDate', start.toISOString());
                }
                if (dateRange.end) {
                    const end = new Date(dateRange.end);
                    end.setHours(23, 59, 59, 999);
                    params.append('endDate', end.toISOString());
                }

                if (params.toString()) url += `?${params.toString()}`;

                const response = await fetch(url);
                if (response.ok) {
                    const data = await response.json();
                    // Sort by Date Descending (Newest First) - API does it but good to ensure
                    try {
                        const sorted = data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                        setPackingData(sorted);
                    } catch (sortErr) {
                        console.error("Sort Error Owner:", sortErr);
                        setPackingData(data);
                    }
                }
            } catch (err) { console.error(err); }
        };

        // Fetch Items
        const fetchItems = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/items`);
                if (response.ok) setItems(await response.json());
            } catch (err) { console.error(err); }
        };

        // Fetch Parties
        const fetchParties = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/parties`);
                if (response.ok) setParties(await response.json());
            } catch (err) { console.error(err); }
        };

        // Fetch Bills
        const fetchBills = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/bills`);
                if (response.ok) setBills(await response.json());
            } catch (err) { console.error(err); }
        };

        fetchPacking();
        if (items.length === 0) fetchItems();
        fetchParties();
        fetchBills();
    }, [dateRange, activeTab]);

    // Import Packing Data
    const handlePackingImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            const text = evt.target.result;
            const lines = text.split(/\r\n|\n/).map(r => r.trim()).filter(r => r);
            if (lines.length === 0) return;

            // Detect Delimiter
            const firstLine = lines[0];
            let delimiter = ',';
            if (firstLine.includes('\t')) delimiter = '\t';
            else if (firstLine.includes(';')) delimiter = ';';

            // Parse Headers (try to find columns by name)
            const headers = firstLine.toLowerCase().split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));

            // Map known column names to their index
            let nameIndex = headers.findIndex(h => h === 'item name' || h === 'itemname' || h.includes('item name'));
            let qtyIndex = headers.findIndex(h => h === 'qty' || h === 'quantity' || h.includes('qty'));
            let dateIndex = headers.findIndex(h => h === 'date' || h.includes('date') || h === 'createdat'); // Find Date Column
            let submittedByIndex = headers.findIndex(h => h.includes('submitted') || h === 'packer');
            let statusIndex = headers.findIndex(h => h === 'status');
            let packingTypeIndex = headers.findIndex(h => h.includes('packing') || h.includes('type'));

            // Fallback strategy if headers not found via name matching
            if (nameIndex === -1 || qtyIndex === -1) {
                // User Format: ID, DATE, ITEM NAME, QTY, Submitted By, Group...
                if (headers.length >= 10 && (headers[0].includes('id') || headers[1].includes('date'))) {
                    dateIndex = 1;
                    nameIndex = 2;
                    qtyIndex = 3;
                    submittedByIndex = 4;
                    statusIndex = 6;
                    packingTypeIndex = 9;
                }
            }

            if (nameIndex === -1 || qtyIndex === -1) {
                console.error('Debug Headers:', headers);
                alert(`Could not detect 'Item Name' or 'Qty' columns.\nHeaders found: ${headers.join(', ')}`);
                return;
            }

            const data = lines.slice(1).map((row, idx) => {
                const values = row.split(delimiter);

                // Safety check
                if (values.length <= Math.max(nameIndex, qtyIndex)) return null;

                let itemName = values[nameIndex]?.replace(/^"|"$/g, '').replace(/[^\x20-\x7E]/g, '').trim();
                let qtyStr = values[qtyIndex]?.replace(/^"|"$/g, '').replace(/[^\x20-\x7E]/g, '').trim();

                let qty = parseFloat(qtyStr);

                if (!itemName || isNaN(qty)) {
                    console.warn(`Skipping row ${idx + 2}: Invalid Name or Qty`, row);
                    return null;
                }

                let packingType = 'Box';
                let submittedBy = 'Imported';
                let status = 'Pending';
                let dateStr = null;

                if (packingTypeIndex !== -1 && values[packingTypeIndex]) packingType = values[packingTypeIndex].replace(/^"|"$/g, '').trim() || 'Box';
                if (statusIndex !== -1 && values[statusIndex]) status = values[statusIndex].replace(/^"|"$/g, '').trim() || 'Pending';
                if (submittedByIndex !== -1 && values[submittedByIndex]) {
                    submittedBy = values[submittedByIndex].replace(/^"|"$/g, '').trim();
                }
                if (dateIndex !== -1 && values[dateIndex]) {
                    dateStr = values[dateIndex].replace(/^"|"$/g, '').trim();
                    // Attempt to parse DD/MM/YYYY or DD-MM-YYYY to ISO
                    const dmy = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
                    if (dmy) {
                        // Create valid ISO string: YYYY-MM-DD
                        dateStr = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
                    }
                }

                // Status Validation
                const validStatuses = ['Pending', 'Approved', 'Rejected'];
                if (!validStatuses.includes(status)) status = 'Pending';

                let approvedQty = (status === 'Approved') ? qty : 0;
                let notApprovedQty = (status === 'Rejected') ? qty : 0;

                return {
                    itemName,
                    qty,
                    submittedBy: submittedBy || 'Owner',
                    packingType,
                    status,
                    approvedQty,
                    notApprovedQty,
                    date: dateStr // Send date to backend
                };
            }).filter(i => i);

            if (data.length === 0) {
                alert("No valid data found. Pls check format.");
                return;
            }

            if (window.confirm(`Found ${data.length} entries. Import?`)) {
                try {
                    const res = await fetch(`${API_BASE_URL}/api/packing/bulk`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });

                    if (res.ok) {
                        const result = await res.json();
                        let msg = `Import Success!\nInserted: ${result.insertedCount}`;

                        if (result.skippedCount > 0) {
                            msg += `\nSkipped/Failed: ${result.skippedCount}`;
                            msg += `\n\nErrors (First 20):\n` + result.errors.map(e =>
                                `Row ${e.index || '?'}: ${e.reason}`
                            ).join('\n');
                        }

                        alert(msg);

                        // Refresh
                        const response = await fetch(`${API_BASE_URL}/api/packing`);
                        if (response.ok) {
                            const data = await response.json();
                            const sorted = data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                            setPackingData(sorted);
                        }
                    } else {
                        const err = await res.json();
                        let errMsg = "Import Failed: " + (err.message || "Unknown error");
                        if (err.errors && err.errors.length > 0) {
                            errMsg += `\n\nDetails:\n` + err.errors.map(e => `Row ${e.index || '?'}: ${e.reason}`).join('\n');
                        }
                        alert(errMsg);
                    }
                } catch (error) {
                    console.error("Import error", error);
                    alert("Import Error: " + error.message);
                }
            }
            e.target.value = null; // Reset
        };
        reader.readAsText(file);
    };

    // Import Party Data
    const handlePartyImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            const text = evt.target.result;
            const lines = text.split(/\r\n|\n/).map(r => r.trim()).filter(r => r);
            if (lines.length === 0) return;

            // Detect Delimiter
            const firstLine = lines[0];
            let delimiter = ',';
            if (firstLine.includes('\t')) delimiter = '\t';
            else if (firstLine.includes(';')) delimiter = ';';
            else if (firstLine.includes('|')) delimiter = '|';

            // We expect: Name, Station, Mobile
            // But let's check headers first
            const headers = firstLine.toLowerCase().split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));

            let nameIdx = headers.findIndex(h => h.includes('name') || h.includes('party'));
            let stationIdx = headers.findIndex(h => h.includes('station') || h.includes('city'));
            let mobileIdx = headers.findIndex(h => h.includes('mobile') || h.includes('phone') || h.includes('contact'));

            // Fallback if no headers
            if (nameIdx === -1) {
                // Assume Column 1 is Name, Column 2 is Station, Column 3 is Mobile
                nameIdx = 0;
                stationIdx = 1;
                mobileIdx = 2;
            }

            const data = lines.slice(1).map((row, idx) => {
                const values = row.split(delimiter);
                if (values.length <= nameIdx) return null;

                const name = values[nameIdx]?.replace(/^"|"$/g, '').trim();
                if (!name) return null;

                const station = (stationIdx !== -1 && values[stationIdx]) ? values[stationIdx].replace(/^"|"$/g, '').trim() : '';
                const mobile = (mobileIdx !== -1 && values[mobileIdx]) ? values[mobileIdx].replace(/^"|"$/g, '').trim() : '';

                return { name, station, mobile };
            }).filter(i => i);

            if (data.length === 0) {
                alert("No valid party data found.");
                return;
            }

            if (window.confirm(`Found ${data.length} parties. Import?`)) {
                try {
                    const res = await fetch(`${API_BASE_URL}/api/parties/bulk`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });

                    if (res.ok) {
                        alert(`Imported ${data.length} parties successfully.`);
                        // Refresh
                        const response = await fetch(`${API_BASE_URL}/api/parties`);
                        if (response.ok) setParties(await response.json());
                    } else {
                        const err = await res.json();
                        alert("Import failed: " + err.message);
                    }
                } catch (error) {
                    console.error('Import error', error);
                    alert("Import Error: " + error.message);
                }
            }
            e.target.value = null;
        };
        reader.readAsText(file);
    };


    // Export to CSV
    const downloadCSV = () => {
        if (packingData.length === 0) {
            alert("No data to export");
            return;
        }

        const itemGroupMap = {};
        items.forEach(i => {
            itemGroupMap[i.itemName] = i.group;
        });

        const headers = [
            "ID", "DATE", "ITEM NAME", "QTY", "Submitted By", "Group",
            "Status", "Auditor Remarks", "Username", "Packing Type",
            "Approved Qty", "Not Approved Qty"
        ];

        const rows = packingData.map((row, index) => {
            // Calculations
            const qty = row.qty || 0;
            const approved = row.approvedQty || 0;
            const rejected = row.notApprovedQty || 0;
            // Balance logic removed

            // Format Date
            const dateObj = new Date(row.createdAt);
            const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString();

            return [
                packingData.length - index, // Export Sequential ID
                dateStr,
                `"${(row.itemName || '').replace(/"/g, '""')}"`, // Escape quotes
                qty,
                row.submittedBy,
                `"${(itemGroupMap[row.itemName] || 'N/A').replace(/"/g, '""')}"`, // Group lookup
                row.status,
                `"${(row.auditorRemarks || '').replace(/"/g, '""')}"`,
                row.auditedBy || '', // "Username" column (Auditor)
                row.packingType,
                approved,
                rejected
            ].join(",");
        });

        const csvContent = "data:text/csv;charset=utf-8,"
            + headers.join(",") + "\n"
            + rows.join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Packing_List_Export_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Export BILLS to CSV
    const downloadBillsCSV = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/bills/export`);
            if (!res.ok) throw new Error('Failed to fetch data');

            const data = await res.json();
            if (data.length === 0) {
                alert("No bill data to export");
                return;
            }

            const headers = [
                "Bill No", "Date", "Customer", "Station", "Vehicle",
                "Item Name", "Qty", "Rate", "Amount", "Group", "SubGroup", "UCap", "LCap"
            ];

            const rows = data.map(row => [
                row.billNo,
                new Date(row.date).toLocaleDateString(),
                `"${row.customer}"`,
                `"${row.station}"`,
                row.vehicleNo,
                `"${row.itemName}"`,
                row.qty,
                row.rate,
                row.amount,
                row.group,
                row.subGroup,
                row.uCap,
                row.lCap
            ].join(","));

            const csvContent = "data:text/csv;charset=utf-8,"
                + headers.join(",") + "\n"
                + rows.join("\n");

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `All_Bills_Export_${new Date().toISOString().slice(0, 10)}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error) {
            console.error(error);
            alert("Export Failed");
        }
    };

    const downloadPDF = async () => {
        if (packingData.length === 0) {
            alert("No data to export");
            return;
        }

        try {
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            let y = 15;

            const addHeader = (pageNum, total) => {
                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(20);
                pdf.text("PACKING LIST REPORT", 10, y);
                y += 8;

                pdf.setFontSize(10);
                pdf.setFont("helvetica", "normal");
                pdf.text(`Generated on: ${new Date().toLocaleDateString()}`, 10, y);

                const rangeText = `Range: ${dateRange.start || 'Start'} to ${dateRange.end || 'Today'}`;
                const rangeWidth = pdf.getTextWidth(rangeText);
                pdf.text(rangeText, pageWidth - rangeWidth - 10, y);

                y += 5;
                pdf.setDrawColor(0, 82, 204);
                pdf.setLineWidth(1);
                pdf.line(10, y, pageWidth - 10, y);
                y += 10;
            };

            const addTableHeaders = () => {
                pdf.setFillColor(40, 40, 40);
                pdf.rect(10, y - 5, pageWidth - 20, 8, 'F');
                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(9);
                pdf.setTextColor(255, 255, 255);

                pdf.text("DATE", 12, y);
                pdf.text("ITEM NAME", 40, y);
                pdf.text("CATEGORY", 100, y);
                pdf.text("QTY", 145, y);
                pdf.text("STAFF", 160, y);
                pdf.text("STATUS", 185, y);

                pdf.setTextColor(0, 0, 0);
                y += 8;
            };

            // Initial Header
            addHeader(1, 1);

            // Stats Summary
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(10);
            pdf.text(`TOTAL ENTRIES: ${packingData.length}`, 15, y);
            pdf.text(`TOTAL QTY: ${packingData.reduce((sum, i) => sum + (i.qty || 0), 0)}`, 80, y);
            y += 10;

            addTableHeaders();

            packingData.forEach((row, index) => {
                if (y > pageHeight - 20) {
                    pdf.addPage();
                    y = 15;
                    addHeader();
                    addTableHeaders();
                }

                pdf.setFont("helvetica", "normal");
                pdf.setFontSize(8);

                // Content
                const date = new Date(row.createdAt).toLocaleDateString();
                const category = items.find(i => i.itemName === row.itemName)?.group || '-';

                pdf.text(date, 12, y);

                // Truncate long item names
                const itemName = row.itemName?.length > 35 ? row.itemName.substring(0, 32) + '...' : row.itemName;
                pdf.text(itemName || '', 40, y);

                pdf.text(category, 100, y);
                pdf.text((row.qty || 0).toString(), 145, y);
                pdf.text(row.submittedBy || '', 160, y);

                // Status Color Logic
                if (row.status === 'Approved') pdf.setTextColor(0, 150, 0);
                else if (row.status === 'Rejected') pdf.setTextColor(200, 0, 0);
                else pdf.setTextColor(150, 100, 0);

                pdf.text(row.status || 'Pending', 185, y);
                pdf.setTextColor(0, 0, 0);

                // Row Line
                pdf.setDrawColor(230, 230, 230);
                pdf.setLineWidth(0.1);
                pdf.line(10, y + 2, pageWidth - 10, y + 2);

                y += 7;
            });

            const fileName = `Packing_Report_${dateRange.start || 'All'}_to_${dateRange.end || 'Today'}.pdf`;
            pdf.save(fileName);
        } catch (err) {
            console.error("PDF Export Error:", err);
            alert("Failed to export PDF");
        }
    };

    const downloadSummaryPDF = async () => {
        if (packingData.length === 0) {
            alert("No data to export");
            return;
        }

        try {
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            let y = 15;

            const addHeader = () => {
                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(16);
                pdf.setTextColor(0, 0, 0);
                pdf.text("GROUP WISE SUMMARY REPORT", 10, y);
                y += 8;
                pdf.setFontSize(9);
                pdf.setFont("helvetica", "normal");
                pdf.text(`Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 10, y);

                const rangeText = `Filter: ${dateRange.start || 'Beginning'} to ${dateRange.end || 'Today'}`;
                const rangeWidth = pdf.getTextWidth(rangeText);
                pdf.text(rangeText, pageWidth - rangeWidth - 10, y);

                y += 4;
                pdf.setDrawColor(0, 82, 204);
                pdf.setLineWidth(0.5);
                pdf.line(10, y, pageWidth - 10, y);
                y += 10;
            };

            // 1. Prepare Data
            const itemGroupMap = {};
            items.forEach(i => { itemGroupMap[i.itemName] = i.group; });

            const activeGroups = [...new Set(packingData.map(p => itemGroupMap[p.itemName] || 'Other'))].sort();

            const dateGroups = {};
            packingData.forEach(p => {
                const date = new Date(p.createdAt).toLocaleDateString();
                const group = itemGroupMap[p.itemName] || 'Other';
                if (!dateGroups[date]) dateGroups[date] = {};
                if (!dateGroups[date][group]) dateGroups[date][group] = 0;
                dateGroups[date][group] += (p.qty || 0);
            });

            const sortedDates = Object.keys(dateGroups).sort((a, b) => new Date(b) - new Date(a));

            addHeader();

            // Table Setup
            const dateColWidth = 30;
            const remainingWidth = pageWidth - 20 - dateColWidth;
            const groupColWidth = remainingWidth / activeGroups.length;

            const addTableHead = () => {
                pdf.setFillColor(60, 60, 60);
                pdf.rect(10, y - 5, pageWidth - 20, 8, 'F');
                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(8);
                pdf.setTextColor(255, 255, 255);

                pdf.text("DATE", 12, y);
                activeGroups.forEach((g, i) => {
                    const x = 10 + dateColWidth + (i * groupColWidth);
                    // Center text in column
                    const text = g.substring(0, 12);
                    const textWidth = pdf.getTextWidth(text);
                    pdf.text(text, x + (groupColWidth / 2) - (textWidth / 2), y);
                });
                pdf.setTextColor(0, 0, 0);
                y += 8;
            };

            addTableHead();

            sortedDates.forEach(date => {
                if (y > pageHeight - 15) {
                    pdf.addPage();
                    y = 15;
                    addHeader();
                    addTableHead();
                }

                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(8);
                pdf.text(date, 12, y);

                pdf.setFont("helvetica", "normal");
                activeGroups.forEach((g, i) => {
                    const x = 10 + dateColWidth + (i * groupColWidth);
                    const qty = dateGroups[date][g] || 0;
                    const text = qty > 0 ? qty.toString() : "-";
                    const textWidth = pdf.getTextWidth(text);

                    if (qty > 0) pdf.setFont("helvetica", "bold");
                    pdf.text(text, x + (groupColWidth / 2) - (textWidth / 2), y);
                    pdf.setFont("helvetica", "normal");
                });

                pdf.setDrawColor(240, 240, 240);
                pdf.line(10, y + 2, pageWidth - 10, y + 2);
                y += 7;
            });

            pdf.save(`Summary_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
        } catch (err) {
            console.error(err);
            alert("Summary Export Failed");
        }
    };

    const handlePrintToggle = async (id) => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/packing/${id}/print`, { method: 'PATCH' });
            if (response.ok) {
                const updated = await response.json();
                setPackingData(packingData.map(item => item._id === id ? updated : item));
            }
        } catch (error) {
            console.error("Error toggling print status", error);
        }
    };

    const handleDeleteEntry = async (id) => {
        if (window.confirm('Are you sure you want to delete this entry? This cannot be undone.')) {
            try {
                const response = await fetch(`${API_BASE_URL}/api/packing/${id}`, {
                    method: 'DELETE'
                });
                if (response.ok) {
                    setPackingData(packingData.filter(item => item._id !== id));
                } else {
                    alert('Failed to delete entry');
                }
            } catch (error) {
                console.error("Error deleting entry", error);
            }
        }
    };

    // Handle Add User/Item/Party Logic
    const handleAddParty = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_BASE_URL}/api/parties`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newParty)
            });
            if (res.ok) {
                const saved = await res.json();
                setParties([...parties, saved]);
                setNewParty({ name: '', station: '', mobile: '' });
                alert("Party Added");
            } else {
                alert("Failed to add party");
            }
        } catch (error) {
            console.error(error);
        }
    };

    const handleDeleteParty = async (id) => {
        if (!window.confirm("Delete Party?")) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/parties/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setParties(parties.filter(p => p._id !== id));
            } else {
                alert("Failed");
            }
        } catch (e) { console.error(e); }
    };




    const handleDeleteBill = async (id) => {
        if (window.confirm("Are you sure you want to delete this bill? This cannot be undone.")) {
            try {
                const res = await fetch(`${API_BASE_URL}/api/bills/${id}`, { method: 'DELETE' });
                if (res.ok) {
                    setBills(bills.filter(b => b._id !== id));
                } else {
                    alert("Failed to delete bill");
                }
            } catch (error) {
                console.error("Error deleting bill", error);
            }
        }
    };

    return (
        <Layout title="Owner Dashboard">
            <div className="space-y-6">

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard title="Total Items" value={items.length} icon={Package} color="bg-blue-500" />
                    <StatCard title="Total Packed" value={packingData.length} icon={TrendingUp} color="bg-green-500" />
                    <StatCard title="Pending Audit" value={packingData.filter(i => i.status === 'Pending').length} icon={AlertTriangle} color="bg-yellow-500" />
                    <StatCard title="Active Packers" value="3" icon={Users} color="bg-purple-500" />
                </div>

                <div className="flex justify-end space-x-4">
                    <button
                        onClick={() => navigate('/users')}
                        className="bg-purple-600 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-purple-700 flex items-center"
                    >
                        <Users className="h-5 w-5 mr-2" />
                        Manage Users
                    </button>
                    <button
                        onClick={() => navigate('/item-master')}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-blue-700 flex items-center"
                    >
                        <Package className="h-5 w-5 mr-2" />
                        Item Master
                    </button>
                </div>

                {/* Tabs Section */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden min-h-[400px]">
                    <div className="flex border-b border-gray-100 justify-between items-center bg-gray-50 px-2 py-2">
                        <div className="flex items-center space-x-4">
                            <div className="flex">
                                <button
                                    onClick={() => setActiveTab('packing')}
                                    className={`px-4 py-2 text-sm font-medium rounded-lg ${activeTab === 'packing' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    Packing List
                                </button>
                                <button
                                    onClick={() => setActiveTab('items')}
                                    className={`px-4 py-2 text-sm font-medium rounded-lg ${activeTab === 'items' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    Item Master
                                </button>
                                <button
                                    onClick={() => setActiveTab('parties')}
                                    className={`px-4 py-2 text-sm font-medium rounded-lg ${activeTab === 'parties' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    Parties
                                </button>
                                <button
                                    onClick={() => setActiveTab('bills')}
                                    className={`px-4 py-2 text-sm font-medium rounded-lg ${activeTab === 'bills' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    Saved Bills
                                </button>
                                <button
                                    onClick={() => setActiveTab('print_queue')}
                                    className={`px-4 py-2 text-sm font-medium rounded-lg ${activeTab === 'print_queue' ? 'bg-indigo-600 text-white shadow-lg animate-pulse' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    Print Queue {packingData.filter(p => p.isPrintConfirmed).length > 0 && <span className="ml-1 bg-white text-indigo-600 px-1.5 py-0.5 rounded-full text-[10px] font-black">{packingData.filter(p => p.isPrintConfirmed).length}</span>}
                                </button>
                            </div>

                            {/* Date Filter */}
                            {activeTab === 'packing' && (
                                <div className="flex items-center space-x-2 bg-white p-1 rounded-lg border border-gray-200">
                                    <span className="text-xs text-gray-400 pl-2">Filter:</span>
                                    <input
                                        type="date"
                                        className="text-xs p-1 border rounded text-gray-600"
                                        value={dateRange.start}
                                        onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                                        title="From Date"
                                    />
                                    <span className="text-gray-300">-</span>
                                    <input
                                        type="date"
                                        className="text-xs p-1 border rounded text-gray-600"
                                        value={dateRange.end}
                                        onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                                        title="To Date"
                                    />
                                    {(dateRange.start || dateRange.end) && (
                                        <button
                                            onClick={() => setDateRange({ start: '', end: '' })}
                                            className="text-xs text-red-500 hover:text-red-700 px-1"
                                            title="Clear Date Filter"
                                        >
                                            <XCircle className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {activeTab === 'packing' && (
                            <div className="flex space-x-2">
                                <label className="cursor-pointer text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 flex items-center shadow-sm">
                                    <Upload className="h-3 w-3 mr-1" /> Import
                                    <input type="file" accept=".csv" className="hidden" onChange={handlePackingImport} />
                                </label>
                                <button onClick={downloadCSV} className="text-xs bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700 flex items-center shadow-sm">
                                    <TrendingUp className="h-3 w-3 mr-1" /> CSV
                                </button>
                                <button onClick={downloadPDF} className="text-xs bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700 flex items-center shadow-sm">
                                    <FileText className="h-3 w-3 mr-1" /> Save PDF
                                </button>
                                <button onClick={downloadSummaryPDF} className="text-xs bg-orange-600 text-white px-3 py-1.5 rounded hover:bg-orange-700 flex items-center shadow-sm">
                                    <ClipboardList className="h-3 w-3 mr-1" /> Summary PDF
                                </button>
                                <button
                                    onClick={async () => {
                                        if (window.confirm("Are you sure you want to DELETE ALL packing data? This cannot be undone.")) {
                                            const pwd = prompt("Enter password to confirm:");
                                            if (pwd && pwd.trim() === "2024") {
                                                try {
                                                    const res = await fetch(`${API_BASE_URL}/api/admin/cleanup-packing`, { method: 'DELETE' });
                                                    if (res.ok) {
                                                        alert("All data deleted.");
                                                        setPackingData([]);
                                                    } else {
                                                        const err = await res.json();
                                                        console.error("Delete failed:", err);
                                                        alert(`Failed to delete: ${err.message || res.statusText}`);
                                                    }
                                                } catch (e) {
                                                    console.error("Delete error:", e);
                                                    alert(`Error: ${e.message}`);
                                                }
                                            } else if (pwd !== null) {
                                                alert("Incorrect password.");
                                            }
                                        }
                                    }}
                                    className="text-xs bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700 flex items-center shadow-sm"
                                >
                                    <XCircle className="h-3 w-3 mr-1" /> Delete All
                                </button>
                            </div>
                        )}
                        {activeTab === 'parties' && (
                            <div className="flex space-x-2">
                                <label className="cursor-pointer text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 flex items-center shadow-sm">
                                    <Upload className="h-3 w-3 mr-1" /> Import CSV
                                    <input type="file" accept=".csv" className="hidden" onChange={handlePartyImport} />
                                </label>
                            </div>
                        )}
                        {activeTab === 'bills' && (
                            <div className="flex space-x-2">
                                <button onClick={downloadBillsCSV} className="text-xs bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700 flex items-center shadow-sm">
                                    <TrendingUp className="h-3 w-3 mr-1" /> Export Bills
                                </button>
                            </div>
                        )}
                        {activeTab === 'print_queue' && (
                            <div className="flex space-x-2">
                                <button
                                    onClick={() => {
                                        const printData = packingData
                                            .filter(p => p.isPrintConfirmed)
                                            .map(p => `${p.itemName}\t${p.qty}`)
                                            .join('\n');

                                        if (!printData) {
                                            alert("No items selected for print.");
                                            return;
                                        }

                                        navigator.clipboard.writeText(printData)
                                            .then(() => alert("Item & Qty data copied for print!"))
                                            .catch(err => console.error('Copy failed', err));
                                    }}
                                    className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700 flex items-center shadow-sm"
                                >
                                    <ClipboardList className="h-3 w-3 mr-1" /> Copy Item & Qty Data for Print
                                </button>
                                <button
                                    onClick={async () => {
                                        if (!window.confirm("Untick all items? This will clear the print queue.")) return;

                                        try {
                                            const res = await fetch(`${API_BASE_URL}/api/packing/bulk-print-done`, { method: 'PATCH' });
                                            if (res.ok) {
                                                // Refresh
                                                const response = await fetch(`${API_BASE_URL}/api/packing`);
                                                if (response.ok) {
                                                    const data = await response.json();
                                                    setPackingData(data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
                                                }
                                                alert("All items unticked successfully.");
                                            }
                                        } catch (error) {
                                            console.error("Error unticking items", error);
                                        }
                                    }}
                                    className="text-xs bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700 flex items-center shadow-sm"
                                >
                                    <XCircle className="h-3 w-3 mr-1" /> Untick All Items (Print Done)
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="p-0">
                        {/* Packing List Table */}
                        {activeTab === 'packing' && (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Print</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Name</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Group</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Packer</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Qty</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pkg Status</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Appr / Rej</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Audited By</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {packingData.length === 0 ? (
                                            <tr><td colSpan="9" className="p-4 text-center text-gray-500">No data found.</td></tr>
                                        ) : packingData.map((row, index) => {
                                            const itemGroup = items.find(i => i.itemName === row.itemName)?.group || '-';
                                            return (
                                                <tr key={row._id} className="hover:bg-gray-50 transition-colors">
                                                    <td className="px-6 py-4 whitespace-nowrap text-center border-r border-gray-50">
                                                        <div className="flex flex-col items-center justify-center gap-1">
                                                            <input
                                                                type="checkbox"
                                                                checked={row.isPrintRequested || row.isPrintConfirmed || false}
                                                                onChange={() => handlePrintToggle(row._id)}
                                                                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                            />
                                                            {row.isPrintConfirmed ? (
                                                                <span className="text-[10px] font-black text-indigo-600 uppercase bg-indigo-50 px-1 rounded border border-indigo-100">Conf</span>
                                                            ) : row.isPrintRequested ? (
                                                                <span className="text-xs">⏳</span>
                                                            ) : null}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-blue-600">
                                                        {packingData.length - index}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                        {new Date(row.createdAt).toLocaleDateString()}
                                                        <span className="block text-xs text-gray-400">{new Date(row.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.itemName}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{itemGroup}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{row.submittedBy}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.qty}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">{row.packingStatus || 'New'}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        {row.status === 'Approved' && (
                                                            <span className="flex items-center text-green-600 font-medium text-sm">
                                                                <div className="p-1 bg-green-100 rounded-full mr-2"><CheckCircle className="h-3 w-3" /></div>
                                                                Approved
                                                            </span>
                                                        )}
                                                        {row.status === 'Pending' && (
                                                            <span className="flex items-center text-yellow-600 font-medium text-sm">
                                                                <div className="p-1 bg-yellow-100 rounded-full mr-2"><Clock className="h-3 w-3" /></div>
                                                                Pending
                                                            </span>
                                                        )}
                                                        {row.status === 'Rejected' && (
                                                            <span className="flex items-center text-red-600 font-medium text-sm">
                                                                <div className="p-1 bg-red-100 rounded-full mr-2"><XCircle className="h-3 w-3" /></div>
                                                                Rejected
                                                            </span>
                                                        )}
                                                        {row.auditorRemarks && <div className="text-xs text-gray-400 italic mt-1 max-w-[150px] truncate">{row.auditorRemarks}</div>}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                        <span className="text-green-600">{row.approvedQty || 0}</span> / <span className="text-red-600">{row.notApprovedQty || 0}</span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                        {row.auditedBy || '-'}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                        <button
                                                            onClick={() => handleDeleteEntry(row._id)}
                                                            className="text-red-500 hover:text-red-700 bg-red-50 p-2 rounded-full hover:bg-red-100"
                                                            title="Delete Entry"
                                                        >
                                                            <XCircle className="h-5 w-5" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Item Master List */}
                        {activeTab === 'items' && (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Barcode</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Name</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Group</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {items.map((item) => (
                                            <tr key={item._id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.barcode}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.itemName}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.group}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.unit}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Parties List */}
                        {activeTab === 'parties' && (
                            <div className="p-4">
                                <div className="mb-6 bg-gray-50 p-4 rounded-lg flex items-end space-x-2">
                                    <div className="flex-1">
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                                        <input
                                            value={newParty.name}
                                            onChange={e => setNewParty({ ...newParty, name: e.target.value })}
                                            className="w-full p-2 border rounded"
                                            placeholder="Party Name"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Station</label>
                                        <input
                                            value={newParty.station}
                                            onChange={e => setNewParty({ ...newParty, station: e.target.value })}
                                            className="w-full p-2 border rounded"
                                            placeholder="Station"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Mobile</label>
                                        <input
                                            value={newParty.mobile}
                                            onChange={e => setNewParty({ ...newParty, mobile: e.target.value })}
                                            className="w-full p-2 border rounded"
                                            placeholder="Mobile"
                                        />
                                    </div>
                                    <button onClick={handleAddParty} className="bg-blue-600 text-white px-4 py-2 rounded mb-0.5">
                                        Add
                                    </button>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Party Name</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Station</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mobile</th>
                                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {parties.map((p) => (
                                                <tr key={p._id} className="hover:bg-gray-50 transition-colors">
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{p.name}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.station}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.mobile}</td>
                                                    <td className="px-6 py-4 text-right">
                                                        <button onClick={() => handleDeleteParty(p._id)} className="text-red-500 hover:text-red-700">
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Saved Bills List */}
                        {activeTab === 'bills' && (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bill No</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                                            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {bills.length === 0 ? (
                                            <tr><td colSpan="5" className="p-4 text-center text-gray-500">No saved bills found.</td></tr>
                                        ) : bills.map((bill) => (
                                            <tr key={bill._id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    {new Date(bill.date).toLocaleDateString()}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{bill.billNo}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    {bill.customerDetails.name} <span className="text-xs text-gray-400">({bill.customerDetails.station})</span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-gray-700">₹{bill.grandTotal.toFixed(2)}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                const res = await fetch(`${API_BASE_URL}/api/bills/${bill._id}`);
                                                                if (res.ok) setSelectedBill(await res.json());
                                                            } catch (e) { alert("Failed to fetch bill details"); }
                                                        }}
                                                        className="text-blue-600 hover:text-blue-900 bg-blue-50 px-3 py-1 rounded-full mr-2"
                                                    >
                                                        View
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteBill(bill._id)}
                                                        className="text-red-500 hover:text-red-700 bg-red-50 p-2 rounded-full hover:bg-red-100"
                                                        title="Delete Bill"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Print Queue List */}
                        {activeTab === 'print_queue' && (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Name</th>
                                            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Qty</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Requested By</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {packingData.filter(p => p.isPrintConfirmed).length === 0 ? (
                                            <tr><td colSpan="4" className="p-20 text-center text-gray-400 font-bold">No confirmed items in print queue.</td></tr>
                                        ) : packingData.filter(p => p.isPrintConfirmed).map((row) => (
                                            <tr key={row._id} className="hover:bg-indigo-50/30 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-black text-gray-900">{row.itemName}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                                    <span className="text-base font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100">
                                                        {row.qty}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-bold">
                                                    {row.submittedBy}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right">
                                                    <button
                                                        onClick={() => handlePrintToggle(row._id)}
                                                        className="text-gray-400 hover:text-red-500 transition-colors"
                                                        title="Remove from Queue"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* View Bill Modal */}
                {selectedBill && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl p-6 max-h-[90vh] overflow-y-auto">
                            <div className="flex justify-between items-center mb-4 border-b pb-2">
                                <h3 className="text-lg font-bold">Bill Details: {selectedBill.billNo}</h3>
                                <button onClick={() => setSelectedBill(null)} className="text-gray-500 hover:text-gray-700">
                                    <XCircle className="h-6 w-6" />
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                                <div><strong>Date:</strong> {new Date(selectedBill.date).toLocaleDateString()}</div>
                                <div><strong>Customer:</strong> {selectedBill.customerDetails.name}</div>
                                <div><strong>Station:</strong> {selectedBill.customerDetails.station}</div>
                                <div><strong>Vehicle:</strong> {selectedBill.customerDetails.vehicleNo}</div>
                            </div>

                            <table className="w-full border-collapse border border-gray-300 mb-4 text-sm">
                                <thead className="bg-gray-100">
                                    <tr>
                                        <th className="border p-2">Item</th>
                                        <th className="border p-2 text-right">Qty</th>
                                        <th className="border p-2 text-right">Rate</th>
                                        <th className="border p-2 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedBill.items.map((item, idx) => (
                                        <tr key={idx}>
                                            <td className="border p-2">{item.itemName}</td>
                                            <td className="border p-2 text-right">{item.qty}</td>
                                            <td className="border p-2 text-right">{item.rate.toFixed(2)}</td>
                                            <td className="border p-2 text-right">{item.amount?.toFixed(2) || (item.qty * item.rate).toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <div className="flex justify-end border-t pt-4">
                                <div className="text-xl font-bold">Total: ₹{selectedBill.grandTotal.toFixed(2)}</div>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </Layout>
    );
};

export default OwnerDashboard;
