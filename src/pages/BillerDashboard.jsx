import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import API_BASE_URL from '../config';
import { Plus, Trash2, Printer, Save, Minus, Download, Upload, Clock, Keyboard, HelpCircle, Copy, MessageCircle, CheckCircle, AlertTriangle, ChevronDown, X } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import warningSoundFile from '../assets/sounds/warning.mp3';

const BillerDashboard = () => {
    const generateRandomBillNo = () => Math.floor(1000 + Math.random() * 9000).toString();

    const { user } = useAuth();
    const [items, setItems] = useState([]); // All available items
    const [groups, setGroups] = useState([]); // Groups for dropdown
    const [subGroups, setSubGroups] = useState([]); // SubGroups for dropdown
    const [billItems, setBillItems] = useState([]); // Items added to bill
    const [billDetails, setBillDetails] = useState({
        billNo: generateRandomBillNo(), // Auto-generate on mount
        date: new Date().toISOString().slice(0, 10),
        vehicleNo: '',
        vehicleType: '',
        customerName: '',
        customerStation: '' // Added Station
    });

    const [currentBillId, setCurrentBillId] = useState(null); // Track if editing existing bill

    // Custom Label State
    const [grandTotalLabel, setGrandTotalLabel] = useState("Balance");
    const [showPreviewModal, setShowPreviewModal] = useState(false);

    const [parties, setParties] = useState([]);
    const [showAddPartyModal, setShowAddPartyModal] = useState(false);
    const [newParty, setNewParty] = useState({ name: '', station: '', mobile: '' });

    // Item Creation State
    const [showAddItemModal, setShowAddItemModal] = useState(false);

    const [newItem, setNewItem] = useState({
        barcode: '',
        itemName: '',
        group: '',
        subGroup: '',
        short: '',
        unit: ''
    });

    const [showShortcuts, setShowShortcuts] = useState(false);
    const [showSlipPreviewModal, setShowSlipPreviewModal] = useState(false);



    // SubGroup Rates State (Manual Entry)
    const [subGroupRates, setSubGroupRates] = useState({});

    // Adjustments State
    const [adjustments, setAdjustments] = useState([]); // Array of { id, type: 'add'|'deduct', desc, amount }

    // Refs for keyboard navigation
    const inputsRef = useRef([]);

    // Loading State
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null); // Error State
    const [focusedRowIndex, setFocusedRowIndex] = useState(null); // Track focused row for filtered datalist

    // Editable Balance & Export Menu
    const [overrideBalance, setOverrideBalance] = useState(null);
    const [showExportMenu, setShowExportMenu] = useState(null); // 'bill' | 'slip' | null

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Ignore if input focused (unless it's an Alt combo which usually works)
            // Actually, for global actions like Save, we want them to work even from inputs, but we must use Alt/Ctrl to avoid typing.

            if (e.altKey) {
                switch (e.key.toLowerCase()) {
                    case 'n': // Alt + N : New Row
                        e.preventDefault();
                        handleAddItem();
                        break;
                    case 'v': // Alt + V : Preview
                        e.preventDefault();
                        setShowPreviewModal(true);
                        break;
                    case 'c': // Alt + C : Create Master Item
                        e.preventDefault();
                        setShowAddItemModal(true);
                        break;
                    case 's': // Alt + S : Save Bill
                        e.preventDefault();
                        handleSaveBill();
                        break;
                    case 'l': // Alt + L : Load Bill
                        e.preventDefault();
                        openLoadModal();
                        break;
                    case 'p': // Alt + P : Slip Preview
                        e.preventDefault();
                        setShowSlipPreviewModal(true);
                        break;
                    case 'h': // Alt + H : Help / Shortcuts
                        e.preventDefault();
                        setShowShortcuts(prev => !prev);
                        break;
                    case '`': // Alt + ` : Focus Summary Price
                        e.preventDefault();
                        const firstPrice = document.getElementById('price-input-0');
                        if (firstPrice) firstPrice.focus();
                        break;
                    default:
                        break;
                }
            }

            if (e.key === 'F2') {
                e.preventDefault();
                const billNoInput = document.getElementById('bill-no-input');
                if (billNoInput) billNoInput.focus();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [billItems, billDetails, newItem]); // Add dependencies as needed for closures

    // Fetch Items and Parties on Mount
    useEffect(() => {
        fetchitems();
        fetchParties();
    }, []);

    const fetchParties = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/parties`);
            if (res.ok) setParties(await res.json());
        } catch (error) { console.error("Error fetching parties", error); }
    };

    // Initial Row
    useEffect(() => {
        if (items.length > 0 && billItems.length === 0) {
            handleAddItem(); // Start with one row
        }
    }, [items]);

    const fetchitems = async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        try {
            console.log("Fetching items/groups/subgroups...");
            const [itemsRes, groupsRes, subGroupsRes] = await Promise.all([
                fetch(`${API_BASE_URL}/api/items`, { signal: controller.signal }),
                fetch(`${API_BASE_URL}/api/groups`, { signal: controller.signal }),
                fetch(`${API_BASE_URL}/api/subgroups`, { signal: controller.signal })
            ]);

            clearTimeout(timeoutId);

            if (itemsRes.ok) setItems(await itemsRes.json());
            if (groupsRes.ok) setGroups(await groupsRes.json());
            if (subGroupsRes.ok) setSubGroups(await subGroupsRes.json());

        } catch (error) {
            console.error("Error fetching data", error);
            if (error.name === 'AbortError') {
                setError("Request timed out. Server might be slow.");
            } else {
                setError(`Failed to load data: ${error.message}`);
            }
        } finally {
            setLoading(false);
        }
    };

    // --- Summary & Warning Logic (Memoized) ---
    const warningAudioRef = useRef(new Audio(warningSoundFile));

    const { combinedSummary, isAllMatch, totalItemQty, totalGroupSummaryQty, totalItemCaps, totalSubGroupSummaryQty, isQtyMatch } = React.useMemo(() => {
        // 1. Group Summary (Based on Item Qty)
        const groupSummaryObj = {};
        // 2. Subgroup Summary (Based on U/L Caps)
        const subGroupSummaryObj = {};

        // Find the canonical spelling for "Jointer" if it exists in the items, otherwise default to "Jointer"
        const jointerKey = billItems.find(i => i.subGroup && i.subGroup.trim().toLowerCase() === 'jointer')?.subGroup || 'Jointer';

        billItems.forEach(item => {
            if (!item.itemName) return;

            // Group Calculation
            const groupName = item.group || 'General';
            if (!groupSummaryObj[groupName]) groupSummaryObj[groupName] = 0;
            groupSummaryObj[groupName] += (Number(item.qty) || 0);

            // Subgroup Calculation
            const subName = item.subGroup;
            if (subName) {
                const uCap = Number(item.uCap) || 0;
                const lCap = Number(item.lCap) || 0;
                const subNameLower = subName.trim().toLowerCase();

                if (subNameLower === 'fluted jointer') {
                    // "Fluted jointer": Count ONLY uCap for itself
                    if (!subGroupSummaryObj[subName]) subGroupSummaryObj[subName] = 0;
                    subGroupSummaryObj[subName] += uCap;

                    // ADD lCap to "Jointer"
                    if (!subGroupSummaryObj[jointerKey]) subGroupSummaryObj[jointerKey] = 0;
                    subGroupSummaryObj[jointerKey] += lCap;

                } else if (subNameLower === 'jointer') {
                    // "Jointer": Count uCap + lCap (its own)
                    if (!subGroupSummaryObj[subName]) subGroupSummaryObj[subName] = 0;
                    subGroupSummaryObj[subName] += (uCap + lCap);
                } else {
                    // Standard Logic
                    if (!subGroupSummaryObj[subName]) subGroupSummaryObj[subName] = 0;
                    subGroupSummaryObj[subName] += (uCap + lCap);
                }
            }
        });

        // Merge into single array
        const validCombinedSummary = [
            ...Object.entries(groupSummaryObj).map(([name, qty]) => ({
                type: 'Group',
                name,
                qty,
                id: `GRP-${name}`
            })),
            ...Object.entries(subGroupSummaryObj).map(([name, qty]) => ({
                type: 'Subgroup',
                name,
                qty,
                id: `SUB-${name}`
            }))
        ].map(item => {
            const rate = subGroupRates[item.id] || 0;
            return {
                ...item,
                rate,
                total: item.qty * rate
            };
        });

        // Warning Logic Calculation
        const totalItemQty = billItems.reduce((acc, item) => acc + (parseFloat(item.qty) || 0), 0);
        const totalItemCaps = billItems.reduce((acc, item) => acc + (parseFloat(item.uCap) || 0) + (parseFloat(item.lCap) || 0), 0);

        const totalGroupSummaryQty = validCombinedSummary
            .filter(i => i.type === 'Group')
            .reduce((acc, item) => acc + (parseFloat(item.qty) || 0), 0);

        const totalSubGroupSummaryQty = validCombinedSummary
            .filter(i => i.type === 'Subgroup')
            .reduce((acc, item) => acc + (parseFloat(item.qty) || 0), 0);

        const isQtyMatch = Math.abs(totalItemQty - totalGroupSummaryQty) < 0.01;
        const isCapMatch = Math.abs(totalItemCaps - totalSubGroupSummaryQty) < 0.01;
        const isAllMatch = isQtyMatch && isCapMatch;

        return {
            combinedSummary: validCombinedSummary,
            isAllMatch,
            totalItemQty,
            totalGroupSummaryQty,
            totalItemCaps,
            totalSubGroupSummaryQty,
            isQtyMatch
        };

    }, [billItems, subGroupRates]);

    // Sound Effect Trigger
    useEffect(() => {
        if (!isAllMatch) {
            console.log("Qty Mismatch! Playing warning sound.");
            warningAudioRef.current.currentTime = 0;
            warningAudioRef.current.play().catch(e => console.error("Audio play failed", e));
        } else {
            // Stop sound on OK
            warningAudioRef.current.pause();
            warningAudioRef.current.currentTime = 0;
        }
    }, [isAllMatch]);

    const adjustmentTotal = adjustments.reduce((sum, adj) => {
        const amt = parseFloat(adj.amount) || 0;
        return adj.type === 'add' ? sum + amt : sum - amt;
    }, 0);

    const sumOfItems = combinedSummary.reduce((sum, g) => sum + g.total, 0);
    const calculatedTotal = sumOfItems + adjustmentTotal;
    const grandTotal = overrideBalance !== null ? parseFloat(overrideBalance) : calculatedTotal;


    // Handlers
    const handleAddItem = () => {
        setBillItems(prev => [...prev, {
            sr: prev.length + 1,
            itemId: '', // Not strictly needed for datalist, but good for ID tracking if we match
            itemName: '',
            group: '',
            subGroup: '', // Track SubGroup
            qty: '', // Empty string for easier typing
            uCap: '',
            lCap: '',
            rate: 0
        }]);
    };

    const handleItemChange = (index, field, value) => {
        setBillItems(prevItems => prevItems.map((item, i) => {
            if (i === index) {
                let updatedItem = { ...item, [field]: value };

                // Auto-fill details if item name matches
                if (field === 'itemName') {
                    // Normalize value for comparison
                    const lowerValue = value.toLowerCase();

                    const selectedItem = items.find(i =>
                        i.itemName.toLowerCase() === lowerValue ||
                        (i.short && i.short.toLowerCase() === lowerValue)
                    );

                    if (selectedItem) {
                        // If exact match on short code or name, use the full official name
                        updatedItem.itemName = selectedItem.itemName;
                        updatedItem.itemId = selectedItem._id;
                        updatedItem.group = selectedItem.group;
                        updatedItem.subGroup = selectedItem.subGroup || '';
                        updatedItem.rate = selectedItem.rate || 0;
                        updatedItem.unit = selectedItem.unit;
                    }
                }
                return updatedItem;
            }
            return item;
        }));
    };

    const handleRemoveItem = (index) => {
        const updatedItems = billItems.filter((_, i) => i !== index).map((item, i) => ({ ...item, sr: i + 1 }));
        setBillItems(updatedItems);
    };

    // Adjustment Handlers
    const handleAddAdjustment = (type) => {
        setAdjustments([...adjustments, {
            id: Date.now(),
            type,
            desc: '',
            amount: ''
        }]);
    };

    const handleUpdateAdjustment = (id, field, value) => {
        setAdjustments(adjustments.map(adj =>
            adj.id === id ? { ...adj, [field]: value } : adj
        ));
    };

    const handleRemoveAdjustment = (id) => {
        setAdjustments(adjustments.filter(adj => adj.id !== id));
    };

    // Print Handler
    const [printMode, setPrintMode] = useState('normal'); // 'normal' | 'slip'

    const handleDownloadImage = async (mode = 'normal') => {
        console.log(`Starting image download for mode: ${mode}`);
        setPrintMode(mode);

        setTimeout(async () => {
            // Use printable-slip for slip mode to get all data in one image
            const elementId = mode === 'slip' ? 'printable-slip' : 'printable-bill';
            const element = document.getElementById(elementId);

            if (!element) {
                alert('Error: Element to capture not found!');
                setPrintMode('normal');
                return;
            }

            try {
                const canvas = await html2canvas(element, {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: '#ffffff',
                    logging: false
                });

                setPrintMode('normal');
                const imgData = canvas.toDataURL('image/png');
                const filename = `Bill-${billDetails.billNo || 'Draft'}-${mode}.png`;

                // Reuse existing download logic
                const link = document.createElement('a');
                link.download = filename;
                link.href = imgData;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } catch (error) {
                console.error('Image download failed:', error);
                alert('Error: ' + error.message);
                setPrintMode('normal');
            }
        }, 300);
    };

    const handleCopyImage = async (mode = 'normal') => {
        setPrintMode(mode);
        setTimeout(async () => {
            const elementId = mode === 'slip' ? 'printable-slip' : 'printable-bill';
            const element = document.getElementById(elementId);

            if (!element) {
                alert('Error: Element to capture not found!');
                setPrintMode('normal');
                return;
            }

            try {
                const canvas = await html2canvas(element, {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: '#ffffff',
                    logging: false
                });

                setPrintMode('normal');
                const dataUrl = canvas.toDataURL('image/png');

                // Robust Electron Check
                let ipcRenderer = null;
                try {
                    if (window.require) {
                        const electron = window.require('electron');
                        ipcRenderer = electron.ipcRenderer;
                    }
                } catch (e) {
                    console.warn('Not running in Electron or require failed:', e);
                }

                if (ipcRenderer) {
                    // Use Electron Native Image Copy
                    try {
                        const result = await ipcRenderer.invoke('copy-image-to-clipboard', { dataUrl });
                        if (result.success) {
                            alert('Image copied to clipboard (System Native)!');
                        } else {
                            alert('Failed to copy image: ' + result.error);
                        }
                    } catch (err) {
                        console.error('Electron clipboard error:', err);
                        alert('Error copying in app mode: ' + err.message);
                    }
                } else {
                    // Fallback to Web API
                    canvas.toBlob(async (blob) => {
                        try {
                            const item = new ClipboardItem({ 'image/png': blob });
                            await navigator.clipboard.write([item]);
                            alert('Image copied to clipboard!');
                        } catch (err) {
                            console.error('Copy to clipboard failed:', err);
                            alert('Failed to copy image: ' + err.message);
                        }
                    }, 'image/png');
                }

            } catch (error) {
                console.error('Image capture failed:', error);
                alert('Error: ' + error.message);
                setPrintMode('normal');
            }
        }, 300);
    };

    const handleCopyText = (mode = 'normal') => {
        let text = `BILL: ${billDetails.billNo}\nDATE: ${billDetails.date}\nCUSTOMER: ${billDetails.customerName}\n\n`;

        if (mode === 'slip') {
            text += "NO. | ITEM | QTY | U CAP | L CAP\n";
            billItems.filter(i => i.itemName).forEach((item, idx) => {
                text += `${idx + 1} | ${item.itemName} | ${item.qty} | ${item.uCap || '-'} | ${item.lCap || '-'}\n`;
            });
        } else {
            text += "SUMMARY:\n";
            combinedSummary.forEach(s => {
                text += `${s.name}: ${s.qty} @ ${s.rate.toFixed(2)} = ${s.total.toFixed(2)}\n`;
            });
            text += `\nADJUSTMENTS:\n`;
            adjustments.forEach(adj => {
                text += `${adj.type === 'add' ? 'ADD' : 'LESS'}: ${adj.desc} = ${adj.amount}\n`;
            });
        }
        text += `\nTOTAL BALANCE: ${grandTotal.toFixed(2)}`;

        navigator.clipboard.writeText(text).then(() => {
            alert('Bill data copied to clipboard!');
        }).catch(err => {
            console.error('Copy failed:', err);
        });
    };

    // PDF Save Handler
    // PDF Save Handler
    // PDF Save Handler
    const handleSavePDF = async (mode = 'normal', action = 'save') => {
        setPrintMode(mode);
        setTimeout(async () => {

            const containerId = mode === 'slip' ? 'pdf-pages-container' : 'summary-bill-pages-container';
            const container = document.getElementById(containerId);
            if (!container) {
                alert(`Error: Container ${containerId} not found!`);
                setPrintMode('normal');
                return;
            }

            try {
                const pdf = new jsPDF('p', 'mm', 'a4');
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = pdf.internal.pageSize.getHeight();

                const pages = Array.from(container.getElementsByClassName('pdf-page'));

                if (pages.length === 0) {
                    alert('Error: No pages found to render.');
                    setPrintMode('normal');
                    return;
                }

                console.log(`Found ${pages.length} pages to render.`);

                const captureWidth = 1200;

                for (let i = 0; i < pages.length; i++) {
                    const page = pages[i];
                    console.log(`Rendering page ${i + 1}...`);
                    if (i > 0) pdf.addPage();

                    const canvas = await html2canvas(page, {
                        scale: 2,
                        useCORS: true,
                        backgroundColor: '#ffffff',
                        width: 1200,
                        windowWidth: 1200,
                        x: 0,
                        y: 0,
                        scrollX: 0,
                        scrollY: 0,
                        logging: false
                    });

                    const imgData = canvas.toDataURL('image/png');
                    const imgHeightMM = (canvas.height * pdfWidth) / canvas.width;
                    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, imgHeightMM);
                }

                // Hide again
                // pagesContainer.style.opacity = '0'; // No longer needed with negative left 
                setPrintMode('normal');

                if (action === 'print') {
                    console.log('Printing PDF in iframe...');
                    pdf.autoPrint();
                    const blobUrl = pdf.output('bloburl');

                    // Create hidden iframe for "direct" print feel
                    const iframe = document.createElement('iframe');
                    iframe.style.position = 'fixed';
                    iframe.style.right = '0';
                    iframe.style.bottom = '0';
                    iframe.style.width = '0';
                    iframe.style.height = '0';
                    iframe.style.border = '0';
                    iframe.src = blobUrl;
                    document.body.appendChild(iframe);

                    // Wait for PDF to load in iframe then print
                    iframe.onload = () => {
                        setTimeout(() => {
                            try {
                                iframe.contentWindow.focus();
                                iframe.contentWindow.print();

                                // Remove iframe after a delay to ensure print dialog has opened/processed
                                // Removing it too early might kill the print dialog in some browsers/Electron
                                setTimeout(() => {
                                    if (document.body.contains(iframe)) {
                                        document.body.removeChild(iframe);
                                    }
                                }, 2000); // 2 seconds delay

                            } catch (e) {
                                console.warn('Print iframe failed, fallback to window', e);
                                window.open(blobUrl, '_blank');
                                if (document.body.contains(iframe)) {
                                    document.body.removeChild(iframe);
                                }
                            }
                        }, 500);
                    };
                    return; // Stop here for print action
                }

                const filename = `Bill-${billDetails.billNo || 'Draft'}-${mode}.pdf`;
                const pdfDataUri = pdf.output('datauristring');

                // Robust Electron Check
                let ipcRenderer = null;
                try {
                    if (window.require) {
                        const electron = window.require('electron');
                        ipcRenderer = electron.ipcRenderer;
                    }
                } catch (e) {
                    console.warn('Not running in Electron or require failed:', e);
                }

                if (ipcRenderer) {
                    try {
                        const result = await ipcRenderer.invoke('save-file-dialog', { data: pdfDataUri, filename });
                        if (result.success) {
                            alert('PDF Saved Successfully!');
                        } else if (result.error) {
                            alert('Failed to save PDF: ' + result.error);
                        }
                    } catch (err) {
                        console.error('Electron save error:', err);
                        alert('Error saving in app mode: ' + err.message);
                    }
                } else {
                    try {
                        pdf.save(filename);
                        console.log('Web PDF save triggered');
                    } catch (err) {
                        console.error('Web save error:', err);
                        alert('Error saving in web mode: ' + err.message);
                    }
                }

            } catch (error) {
                console.error('PDF generation failed:', error);
                alert('Detailed Error: ' + error.message);
                pagesContainer.style.opacity = '0';
                setPrintMode('normal');
            }
        }, 500);
    };

    // WhatsApp & Copy Logic
    const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
    const [whatsAppNumber, setWhatsAppNumber] = useState('');


    const openWhatsAppModal = () => {
        // Try to pre-fill with customer mobile if available
        // We don't store mobile in billDetails directly, but we can try to find it in parties
        const party = parties.find(p => p.name === billDetails.customerName);
        if (party && party.mobile) {
            setWhatsAppNumber(party.mobile);
        } else {
            setWhatsAppNumber('');
        }
        setShowWhatsAppModal(true);
    };

    const handleWhatsAppShare = async () => {
        if (!whatsAppNumber) {
            alert("Please enter a mobile number.");
            return;
        }

        setPrintMode('normal');
        setTimeout(async () => {
            const success = await copyBillImageToClipboard();
            if (success) {
                // Open WhatsApp Web
                const url = `https://web.whatsapp.com/send?phone=${whatsAppNumber}`;
                window.open(url, '_blank');

                // Close modal and show instruction
                setShowWhatsAppModal(false);
                setTimeout(() => {
                    alert("Image copied! \n\n1. WhatsApp should open in a new tab.\n2. Click inside the chat message box.\n3. Press Ctrl+V to paste and send.");
                }, 1000);
            }
        }, 100);
    };

    // Add Party Handler
    const handleAddPartySubmit = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_BASE_URL}/api/parties`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newParty)
            });
            if (res.ok) {
                const savedParty = await res.json();
                setParties([...parties, savedParty]);
                setBillDetails({ ...billDetails, customerName: savedParty.name, customerStation: savedParty.station });
                setShowAddPartyModal(false);
                setNewParty({ name: '', station: '', mobile: '' });
            } else {
                alert('Failed to add party');
            }
        } catch (error) {
            console.error(error);
            alert('Error adding party');
        }
    };

    // Create Item Handler
    const handleCreateItemSubmit = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_BASE_URL}/api/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newItem)
            });
            if (res.ok) {
                const savedItem = await res.json();
                alert(`Item "${savedItem.itemName}" created successfully!`);

                // Refresh Items
                fetchitems();

                // Reset and Close
                setShowAddItemModal(false);
                setNewItem({
                    barcode: '',
                    itemName: '',
                    group: '',
                    subGroup: '',
                    short: '',
                    unit: ''
                });
            } else {
                const err = await res.text();
                alert('Failed to create item: ' + err);
            }
        } catch (error) {
            console.error(error);
            alert('Error creating item: ' + error.message);
        }
    };

    // Party Import Handler
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
            const headers = firstLine.toLowerCase().split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));

            let nameIdx = headers.findIndex(h => h.includes('name') || h.includes('party'));
            let stationIdx = headers.findIndex(h => h.includes('station') || h.includes('city'));
            let mobileIdx = headers.findIndex(h => h.includes('mobile') || h.includes('phone') || h.includes('contact'));

            // Fallback if no headers
            if (nameIdx === -1) {
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
                        setShowAddPartyModal(false); // Close Modal
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

    // Handle Customer Name Selection from Datalist
    const handleCustomerChange = (e) => {
        const val = e.target.value;
        const party = parties.find(p => p.name === val);
        if (party) {
            setBillDetails({ ...billDetails, customerName: party.name, customerStation: party.station || '' });
        } else {
            setBillDetails({ ...billDetails, customerName: val });
        }
    };

    // Keyboard Navigation
    const handleKeyDown = (e, rowIndex, colIndex) => {
        const maxCol = 3;

        if (e.key === 'Enter') {
            e.preventDefault();
            if (colIndex < maxCol) {
                const nextInput = inputsRef.current[rowIndex]?.[colIndex + 1];
                if (nextInput) nextInput.focus();
            } else {
                handleAddItem();
                setTimeout(() => {
                    const nextRowInput = inputsRef.current[rowIndex + 1]?.[0];
                    if (nextRowInput) nextRowInput.focus();
                }, 50);
            }
        }

        if (e.key === 'F9') {
            e.preventDefault();
            handleRemoveItem(rowIndex);
        }

        // 4-Way Arrow Navigation
        if (e.key === 'ArrowUp') {
            const prevRowInput = inputsRef.current[rowIndex - 1]?.[colIndex];
            if (prevRowInput) prevRowInput.focus();
        }
        if (e.key === 'ArrowDown') {
            const nextRowInput = inputsRef.current[rowIndex + 1]?.[colIndex];
            if (nextRowInput) nextRowInput.focus();
        }
        if (e.key === 'ArrowLeft') {
            // Move left if cursor is at the start (pos 0) OR if text is fully selected
            const selection = window.getSelection();
            const isFullySelected = e.target.selectionEnd - e.target.selectionStart === e.target.value.length;

            if (e.target.selectionStart === 0 || isFullySelected) {
                const prevColInput = inputsRef.current[rowIndex]?.[colIndex - 1];
                if (prevColInput) prevColInput.focus();
            }
        }
        if (e.key === 'ArrowRight') {
            // Move right if cursor is at the end OR if text is fully selected
            const isFullySelected = e.target.selectionEnd - e.target.selectionStart === e.target.value.length;

            if (e.target.selectionEnd === e.target.value.length || isFullySelected) {
                const nextColInput = inputsRef.current[rowIndex]?.[colIndex + 1];
                if (nextColInput) nextColInput.focus();
            }
        }
    };

    // Helper to assign refs
    const assignRef = (el, rowIndex, colIndex) => {
        if (!inputsRef.current[rowIndex]) {
            inputsRef.current[rowIndex] = [];
        }
        inputsRef.current[rowIndex][colIndex] = el;
    };



    // --- Save & Load Logic ---
    const [savedBills, setSavedBills] = useState([]);
    const [showLoadBillModal, setShowLoadBillModal] = useState(false);

    const resetForm = () => {
        setBillItems([]);
        handleAddItem(); // Start with one empty row
        setBillDetails({
            billNo: generateRandomBillNo(),
            date: new Date().toISOString().slice(0, 10),
            vehicleNo: '',
            vehicleType: '',
            customerName: '',
            customerStation: ''
        });
        setAdjustments([]);
        setSubGroupRates({});
        setCurrentBillId(null);
        setGrandTotalLabel("Balance"); // Reset label
    };

    const handleSaveBill = async () => {
        if (billItems.length === 0 || !billDetails.customerName) {
            alert("Cannot save empty bill. Add items and customer details.");
            return;
        }

        const billData = {
            billNo: billDetails.billNo || `Draft-${Date.now()}`,
            date: billDetails.date,
            customerDetails: {
                name: billDetails.customerName,
                station: billDetails.customerStation,
                vehicleNo: billDetails.vehicleNo,
                vehicleType: billDetails.vehicleType
            },
            items: billItems.filter(i => i.itemName).map(i => ({
                ...i,
                qty: i.qty === '' ? 0 : parseFloat(i.qty)
            })), // Store valid items, default empty qty to 0
            adjustments: adjustments,
            grandTotal: grandTotal
        };

        try {
            const method = currentBillId ? 'PUT' : 'POST';
            const url = currentBillId ? `${API_BASE_URL}/api/bills/${currentBillId}` : `${API_BASE_URL}/api/bills`;

            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(billData)
            });

            if (res.ok) {
                alert("Bill Saved Successfully!");
                resetForm();
                fetchSavedBills(); // Refresh list
            } else {
                console.error("Save failed:", res.status, res.statusText);
                const text = await res.text();
                try {
                    const errData = JSON.parse(text);
                    alert(`Failed to save bill: ${errData.message || errData.error || 'Unknown Error'}`);
                } catch (e) {
                    alert(`Failed to save (Non-JSON): Status ${res.status}. URL: ${url}. Response: ${text.substring(0, 100)}...`);
                }
            }
        } catch (error) {
            console.error(error);
            alert(`Error saving bill: ${error.message}`);
        }
    };

    const fetchSavedBills = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/bills`);
            if (res.ok) setSavedBills(await res.json());
        } catch (error) { console.error(error); }
    };

    const loadBill = async (billSummaryOrFullBill) => {
        try {
            let bill = billSummaryOrFullBill;

            // If it's just a summary (has _id but maybe not full items), fetch detail
            if (billSummaryOrFullBill._id && (!billSummaryOrFullBill.items || billSummaryOrFullBill.items.length === 0)) {
                const res = await fetch(`${API_BASE_URL}/api/bills/${billSummaryOrFullBill._id}`);
                if (res.ok) {
                    bill = await res.json();
                } else {
                    throw new Error("Failed to fetch bill details");
                }
            }

            // Populate State
            setBillDetails({
                billNo: bill.billNo,
                date: new Date(bill.date).toISOString().slice(0, 10),
                vehicleNo: bill.customerDetails.vehicleNo || '',
                vehicleType: bill.customerDetails.vehicleType || '',
                customerName: bill.customerDetails.name,
                customerStation: bill.customerDetails.station || ''
            });

            setCurrentBillId(bill._id);

            setBillItems(bill.items.map(i => ({
                ...i,
                sr: i.sr || 1 // Ensure SR exists
            })));

            setAdjustments(bill.adjustments || []);
            setShowLoadBillModal(false);

        } catch (error) {
            console.error("Error loading bill", error);
            alert("Failed to load bill details.");
        }
    };

    const handleLoadByBillNo = async () => {
        if (!billDetails.billNo) {
            alert("Please enter a Bill No to load.");
            return;
        }
        try {
            const res = await fetch(`${API_BASE_URL}/api/bills/search/${billDetails.billNo}`);
            if (res.ok) {
                const bill = await res.json();
                loadBill(bill);
            } else {
                alert("Bill not found.");
            }
        } catch (error) {
            console.error("Error searching bill", error);
            alert("Failed to search bill.");
        }
    };

    // Open Modal and Fetch
    const openLoadModal = () => {
        fetchSavedBills();
        setShowLoadBillModal(true);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading Items...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="text-center text-red-600">
                    <p className="text-xl font-bold mb-2">Error</p>
                    <p>{error}</p>
                    <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded">Retry</button>
                </div>
            </div>
        );
    }

    return (
        <Layout
            title="Biller Dashboard"
            actions={
                <div className="flex items-center space-x-3">
                    {/* Primary Print/Preview Actions */}
                    <div className="flex bg-blue-600 text-white rounded-lg shadow-md overflow-hidden border border-blue-700">
                        <button
                            onClick={() => setShowPreviewModal(true)}
                            className="flex items-center text-sm px-4 py-2 hover:bg-blue-700 transition-all font-black uppercase tracking-tight"
                            title="Preview Summary Bill (Alt + V)"
                        >
                            <Printer className="h-4 w-4 mr-2" /> Summary Bill
                        </button>
                        <button
                            onClick={() => handleSavePDF('normal', 'print')}
                            className="px-2 border-l border-blue-500 hover:bg-blue-700 transition-all text-blue-100"
                            title="Quick Print Bill"
                        >
                            <Printer className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="flex bg-teal-600 text-white rounded-lg shadow-md overflow-hidden border border-teal-700">
                        <button
                            onClick={() => setShowSlipPreviewModal(true)}
                            className="flex items-center text-sm px-4 py-2 hover:bg-teal-700 transition-all font-black uppercase tracking-tight"
                            title="Preview Packing Slip (Alt + P)"
                        >
                            <Printer className="h-4 w-4 mr-2" /> Packing Slip
                        </button>
                        <button
                            onClick={() => handleSavePDF('slip', 'print')}
                            className="px-2 border-l border-teal-500 hover:bg-teal-700 transition-all text-teal-100"
                            title="Quick Print Slip"
                        >
                            <Printer className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="h-8 w-px bg-white/20 mx-2"></div>

                    <button
                        onClick={handleSaveBill}
                        className="flex items-center text-sm bg-emerald-500 text-white px-4 py-2 rounded-lg hover:bg-emerald-600 transition-all shadow-md font-bold"
                        title="Save Bill Data (Alt + S)"
                    >
                        <Save className="h-4 w-4 mr-2" /> Save
                    </button>
                    <button
                        onClick={() => setShowShortcuts(true)}
                        className="flex items-center text-sm bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-900 transition-all shadow-md"
                        title="Keyboard Shortcuts (Alt + H)"
                    >
                        <Keyboard className="h-4 w-4 mr-2" /> Help
                    </button>
                </div>
            }
        >
            {/* UI Restored */}
            {/* Header removed as per request to save space */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Bill No</label>
                    <div className="flex gap-1">
                        <input
                            id="bill-no-input"
                            type="text"
                            className="w-full p-2 border rounded-md"
                            value={billDetails.billNo}
                            onChange={(e) => setBillDetails({ ...billDetails, billNo: e.target.value })}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleLoadByBillNo();
                                }
                            }}
                            placeholder="No"
                        />
                        <button
                            onClick={handleLoadByBillNo}
                            className="p-2 bg-indigo-100 text-indigo-600 rounded hover:bg-indigo-200"
                            title="Load by Bill No"
                        >
                            <Upload className="h-4 w-4" />
                        </button>
                    </div>
                </div>
                <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
                    <input
                        type="date"
                        className="w-full p-2 border rounded-md"
                        value={billDetails.date}
                        onChange={(e) => setBillDetails({ ...billDetails, date: e.target.value })}
                    />
                </div>
                <div className="md:col-span-4">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Customer Name</label>
                    <div className="flex gap-2">
                        <input
                            id="customer-name-input"
                            list="party-list"
                            className="w-full p-2 border rounded-md"
                            value={billDetails.customerName}
                            onChange={handleCustomerChange}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const vehicleInput = document.getElementById('vehicle-no-input');
                                    if (vehicleInput) vehicleInput.focus();
                                }
                            }}
                            placeholder="Search or Enter Name"
                        />
                        <button
                            onClick={() => setShowAddPartyModal(true)}
                            className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200"
                            title="Add New Party"
                        >
                            <Plus className="h-5 w-5" />
                        </button>
                    </div>
                    <datalist id="party-list">
                        {parties.map(p => (
                            <option key={p._id} value={p.name}>{p.station ? `${p.name} - ${p.station}` : p.name}</option>
                        ))}
                    </datalist>
                </div>
                <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Station</label>
                    <input
                        type="text"
                        className="w-full p-2 border rounded-md"
                        value={billDetails.customerStation}
                        onChange={(e) => setBillDetails({ ...billDetails, customerStation: e.target.value })}
                        placeholder="Station"
                    />
                </div>
                <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Vehicle No</label>
                    <input
                        id="vehicle-no-input"
                        type="text"
                        className="w-full p-2 border rounded-md"
                        value={billDetails.vehicleNo}
                        onChange={(e) => setBillDetails({ ...billDetails, vehicleNo: e.target.value })}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                // Focus first item name in entry grid
                                const firstItem = inputsRef.current[0]?.[0];
                                if (firstItem) firstItem.focus();
                            }
                        }}
                        placeholder="MH-XX-XXXX"
                    />
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">

                {/* Left: Item Entry Grid */}
                <div className="flex-grow lg:w-2/3 min-w-0 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                    <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">

                        <div className="flex space-x-2">
                            <button
                                onClick={() => setShowAddItemModal(true)}
                                className="flex items-center text-sm bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700 transition-colors"
                                title="Create New Master Item (Alt + C)"
                            >
                                <Plus className="h-4 w-4 mr-1" /> Create Item
                            </button>
                            <button
                                onClick={() => setShowPreviewModal(true)}
                                className="flex items-center text-sm bg-purple-600 text-white px-3 py-1.5 rounded hover:bg-purple-700 transition-colors font-bold shadow-sm"
                                title="Preview Grouped Bill (Alt + V)"
                            >
                                <Printer className="h-4 w-4 mr-1" /> Bill Preview
                            </button>
                            <button
                                onClick={() => setShowSlipPreviewModal(true)}
                                className="flex items-center text-sm bg-teal-600 text-white px-3 py-1.5 rounded hover:bg-teal-700 transition-colors font-bold shadow-sm"
                                title="Preview Item Slip (Alt + P)"
                            >
                                <Printer className="h-4 w-4 mr-1" /> Slip Preview
                            </button>
                            <button
                                onClick={openLoadModal}
                                className="flex items-center text-sm bg-blue-800 text-white px-3 py-1.5 rounded hover:bg-blue-900 transition-colors"
                                title="Load Saved Bill (Alt + L)"
                            >
                                <Clock className="h-4 w-4 mr-1" /> Load
                            </button>

                            {/* Qty Warning Indicator */}
                            {(() => {
                                // 1. Item Entry Totals
                                const totalItemQty = billItems.reduce((acc, item) => acc + (parseFloat(item.qty) || 0), 0);
                                const totalItemCaps = billItems.reduce((acc, item) => acc + (parseFloat(item.uCap) || 0) + (parseFloat(item.lCap) || 0), 0);

                                // 2. Summary Totals (Split by Type)
                                const totalGroupSummaryQty = combinedSummary
                                    .filter(i => i.type === 'Group')
                                    .reduce((acc, item) => acc + (parseFloat(item.qty) || 0), 0);

                                const totalSubGroupSummaryQty = combinedSummary
                                    .filter(i => i.type === 'Subgroup')
                                    .reduce((acc, item) => acc + (parseFloat(item.qty) || 0), 0);

                                // 3. Comparison
                                const isQtyMatch = Math.abs(totalItemQty - totalGroupSummaryQty) < 0.01;
                                const isCapMatch = Math.abs(totalItemCaps - totalSubGroupSummaryQty) < 0.01;
                                const isAllMatch = isQtyMatch && isCapMatch;

                                return (
                                    <div
                                        className={`flex items-center text-sm px-3 py-1.5 rounded-lg shadow-md text-white cursor-help transform transition-all duration-300 hover:scale-110 ${isAllMatch ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 animate-pulse ring-4 ring-red-400 font-bold'}`}
                                        title={`Item Qty: ${totalItemQty} / Group Summary: ${totalGroupSummaryQty} \nItem Caps: ${totalItemCaps} / SubGroup Summary: ${totalSubGroupSummaryQty}`}
                                        style={!isAllMatch ? { animationDuration: '0.4s' } : {}}
                                    >
                                        {isAllMatch ?
                                            <CheckCircle className="h-4 w-4 mr-1 transition-transform duration-500 hover:rotate-180" /> :
                                            <AlertTriangle className="h-5 w-5 mr-1 transition-transform duration-100 hover:rotate-12 animate-bounce" />
                                        }
                                        <span className="uppercase tracking-wider font-bold">
                                            {isAllMatch ? 'Qty OK' : (!isQtyMatch ? 'QTY ERR!' : 'CAP ERR!')}
                                        </span>
                                    </div>
                                );
                            })()}


                        </div>
                    </div>

                    <div className="overflow-x-auto flex-grow" style={{ maxHeight: '60vh' }}>
                        <table className="min-w-full divide-y divide-gray-200 relative">
                            <thead className="bg-gray-50 sticky top-0 z-10">
                                <tr>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">SR</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-1/3">Item Name</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">U Cap</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">L Cap</th>
                                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Action</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {billItems.map((item, index) => (
                                    <tr key={index}>
                                        <td className="px-3 py-2 text-sm text-gray-500 text-center">{item.sr}</td>
                                        <td className="px-3 py-2">
                                            {(() => {
                                                const isDuplicate = billItems.filter(i => i.itemName && i.itemName.toLowerCase() === item.itemName.toLowerCase()).length > 1;
                                                return (
                                                    <input
                                                        list="item-list"
                                                        className={`w-full p-1 border rounded text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none ${isDuplicate ? 'border-red-500 text-red-600 font-bold bg-red-50' : ''}`}
                                                        value={item.itemName}
                                                        onChange={(e) => handleItemChange(index, 'itemName', e.target.value)}
                                                        onKeyDown={(e) => handleKeyDown(e, index, 0)}
                                                        ref={(el) => assignRef(el, index, 0)}
                                                        onFocus={(e) => {
                                                            setFocusedRowIndex(index);
                                                            e.target.select();
                                                        }}
                                                        placeholder="Type to search..."
                                                        autoFocus={index === billItems.length - 1 && index > 0} // Autofocus new rows
                                                        title={isDuplicate ? "Duplicate Item" : ""}
                                                    />
                                                );
                                            })()}
                                        </td>
                                        <td className="px-3 py-2">
                                            <input
                                                type="text"
                                                className="w-full p-1 border rounded text-sm text-right focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                                value={item.qty}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                                        handleItemChange(index, 'qty', val);
                                                    }
                                                }}
                                                onKeyDown={(e) => handleKeyDown(e, index, 1)}
                                                onFocus={(e) => e.target.select()}
                                                ref={(el) => assignRef(el, index, 1)}
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <input
                                                type="text"
                                                className="w-full p-1 border rounded text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                                value={item.uCap}
                                                onChange={(e) => handleItemChange(index, 'uCap', e.target.value)}
                                                onKeyDown={(e) => handleKeyDown(e, index, 2)}
                                                onFocus={(e) => e.target.select()}
                                                ref={(el) => assignRef(el, index, 2)}
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <input
                                                type="text"
                                                className="w-full p-1 border rounded text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                                value={item.lCap}
                                                onChange={(e) => handleItemChange(index, 'lCap', e.target.value)}
                                                onKeyDown={(e) => handleKeyDown(e, index, 3)}
                                                onFocus={(e) => e.target.select()}
                                                ref={(el) => assignRef(el, index, 3)}
                                            />
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            <button onClick={() => handleRemoveItem(index)} className="text-red-500 hover:text-red-700" tabIndex="-1">
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {billItems.length === 0 && (
                                    <tr>
                                        <td colSpan="6" className="text-center py-8 text-gray-400 text-sm">No items added. Click "Add Row" to start.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>

                        {/* Datalist for Items */}
                        <datalist id="item-list">
                            {(() => {
                                // Filter items based on focused row input to improve performance
                                // If no row is focused or input is empty, show top 50
                                let displayItems = items || [];
                                const currentInput = focusedRowIndex !== null ? billItems[focusedRowIndex]?.itemName?.toLowerCase() : '';

                                if (currentInput) {
                                    try {
                                        displayItems = (items || []).filter(i =>
                                            (i.itemName && i.itemName.toLowerCase().includes(currentInput)) ||
                                            (i.short && i.short.toLowerCase().includes(currentInput))
                                        ).slice(0, 50);
                                    } catch (e) {
                                        console.error("Filter error:", e);
                                        displayItems = [];
                                    }
                                } else {
                                    displayItems = (items || []).slice(0, 50);
                                }

                                return displayItems.map(i => (
                                    <option key={i._id} value={i.itemName}>
                                        {i.itemName} {i.short ? `(Short: ${i.short})` : ''} (₹{i.rate})
                                    </option>
                                ));
                            })()}
                        </datalist>
                    </div>
                </div>

                {/* Right: Group Summary Grid */}
                <div className="lg:w-1/3 min-w-0 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col">
                    <div className="p-4 bg-gray-50 border-b border-gray-100">
                        <h3 className="font-semibold text-gray-700">Summary</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-24">Price</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">

                                {combinedSummary.map((item, idx) => (
                                    <tr key={item.id} className={item.type === 'Group' ? 'bg-blue-50' : ''}>
                                        <td className="px-3 py-2 text-sm text-gray-700 font-medium">
                                            {item.name}
                                        </td>
                                        <td className="px-3 py-2 text-sm text-gray-700 text-right">{item.qty}</td>
                                        <td className="px-3 py-2 text-right">
                                            <input
                                                id={`price-input-${idx}`}
                                                type="text"
                                                className="w-20 p-1 border rounded text-sm text-right focus:ring-2 focus:ring-blue-500 outline-none"
                                                placeholder="0"
                                                value={subGroupRates[item.id] || ''}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                                        setSubGroupRates({
                                                            ...subGroupRates,
                                                            [item.id]: val === '' ? '' : (parseFloat(val) || 0)
                                                        });
                                                    }
                                                }}
                                                onFocus={(e) => e.target.select()}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        const nextInput = document.getElementById(`price-input-${idx + 1}`);
                                                        if (nextInput) nextInput.focus();
                                                    }
                                                    if (e.key === 'ArrowUp') {
                                                        e.preventDefault();
                                                        const prevInput = document.getElementById(`price-input-${idx - 1}`);
                                                        if (prevInput) prevInput.focus();
                                                    }
                                                    if (e.key === 'ArrowDown') {
                                                        e.preventDefault();
                                                        const nextInput = document.getElementById(`price-input-${idx + 1}`);
                                                        if (nextInput) nextInput.focus();
                                                    }
                                                }}
                                            />
                                        </td>
                                        <td className="px-3 py-2 text-sm text-gray-700 text-right font-bold">{item.total.toFixed(2)}</td>
                                    </tr>
                                ))}
                                {combinedSummary.length === 0 && (
                                    <tr>
                                        <td colSpan="4" className="px-3 py-2 text-center text-xs text-gray-400">No data</td>
                                    </tr>
                                )}
                            </tbody>
                            <tfoot className="bg-gray-100 font-bold">
                                {/* Adjustments List in Footer */}
                                {adjustments.map(adj => (
                                    <tr key={adj.id} className={adj.type === 'add' ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}>
                                        <td colSpan="2" className="px-3 py-1">
                                            <div className="flex items-center">
                                                <button onClick={() => handleRemoveAdjustment(adj.id)} className="mr-2 text-gray-400 hover:text-red-500">
                                                    <Trash2 className="h-3 w-3" />
                                                </button>
                                                <input
                                                    type="text"
                                                    className="w-full bg-transparent border-b border-transparent focus:border-gray-300 outline-none text-xs"
                                                    placeholder={adj.type === 'add' ? "Add: Description" : "Less: Description"}
                                                    value={adj.desc}
                                                    onChange={(e) => handleUpdateAdjustment(adj.id, 'desc', e.target.value)}
                                                />
                                            </div>
                                        </td>
                                        <td className="px-3 py-1 text-right text-xs uppercase pr-8">
                                            {adj.type === 'add' ? 'ADD' : 'LESS'}
                                        </td>
                                        <td className="px-3 py-1 text-right">
                                            <input
                                                type="text"
                                                className="w-20 p-1 border rounded text-xs text-right outline-none bg-white"
                                                placeholder="0"
                                                value={adj.amount}
                                                onFocus={(e) => e.target.select()}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                                        handleUpdateAdjustment(adj.id, 'amount', val);
                                                    }
                                                }}
                                            />
                                        </td>
                                    </tr>
                                ))}

                                <tr>
                                    <td colSpan="3" className="px-3 py-2 text-right text-sm text-gray-900 border-t border-gray-300">
                                        <input
                                            type="text"
                                            className="text-right font-bold outline-none border-b border-dashed border-gray-300 focus:border-blue-500 w-48"
                                            value={grandTotalLabel}
                                            onChange={(e) => setGrandTotalLabel(e.target.value)}
                                        />
                                    </td>
                                    <td className="px-3 py-2 text-right text-sm text-blue-700 border-t border-gray-300">{grandTotal.toFixed(2)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* Adjustment Buttons */}
                    <div className="p-2 border-t border-gray-100 flex gap-2 justify-end bg-gray-50">
                        <button
                            onClick={() => handleAddAdjustment('add')}
                            className="flex items-center px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                        >
                            <Plus className="h-3 w-3 mr-1" /> Add (+)
                        </button>
                        <button
                            onClick={() => handleAddAdjustment('deduct')}
                            className="flex items-center px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                        >
                            <Minus className="h-3 w-3 mr-1" /> Deduct (-)
                        </button>
                    </div>


                    <div className="p-4 mt-auto border-t border-gray-100 flex justify-end space-x-3">
                        {/* Buttons moved to Header */}
                    </div>
                </div>
            </div>
            {/* Load Bill Modal */}
            {showLoadBillModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[80vh] flex flex-col">
                        <div className="flex justify-between items-center mb-4 border-b pb-2">
                            <h3 className="text-lg font-bold">Load Saved Bill</h3>
                            <button onClick={() => setShowLoadBillModal(false)} className="text-gray-500 hover:text-gray-700">
                                <Minus className="h-5 w-5 rotate-45" />
                            </button>
                        </div>

                        <div className="overflow-y-auto flex-grow">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-2">Date</th>
                                        <th className="px-4 py-2">Bill No</th>
                                        <th className="px-4 py-2">Customer</th>
                                        <th className="px-4 py-2 text-right">Total</th>
                                        <th className="px-4 py-2 text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {savedBills.map(bill => (
                                        <tr key={bill._id} className="border-b hover:bg-gray-50">
                                            <td className="px-4 py-2">{new Date(bill.date).toLocaleDateString()}</td>
                                            <td className="px-4 py-2 font-medium">{bill.billNo}</td>
                                            <td className="px-4 py-2">{bill.customerDetails.name}</td>
                                            <td className="px-4 py-2 text-right">₹{bill.grandTotal.toFixed(2)}</td>
                                            <td className="px-4 py-2 text-center">
                                                <button
                                                    onClick={() => loadBill(bill)}
                                                    className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-xs"
                                                >
                                                    Load
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {savedBills.length === 0 && (
                                        <tr>
                                            <td colSpan="5" className="text-center py-4 text-gray-500">No saved bills found.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Party Modal */}
            {showAddPartyModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
                        <h3 className="text-lg font-bold mb-4">Add New Party</h3>
                        <form onSubmit={handleAddPartySubmit}>
                            <input
                                autoFocus
                                className="w-full p-2 border rounded mb-3"
                                placeholder="Party Name"
                                value={newParty.name}
                                onChange={e => setNewParty({ ...newParty, name: e.target.value })}
                                required
                            />
                            <input
                                className="w-full p-2 border rounded mb-3"
                                placeholder="Station"
                                value={newParty.station}
                                onChange={e => setNewParty({ ...newParty, station: e.target.value })}
                            />
                            <input
                                className="w-full p-2 border rounded mb-4"
                                placeholder="Mobile (Optional)"
                                value={newParty.mobile}
                                onChange={e => setNewParty({ ...newParty, mobile: e.target.value })}
                            />

                            {/* Import Button inside Modal */}
                            <div className="mb-4 pt-2 border-t border-gray-100">
                                <label className="flex items-center justify-center w-full px-4 py-2 text-sm text-blue-600 bg-blue-50 rounded-lg cursor-pointer hover:bg-blue-100">
                                    <Upload className="h-4 w-4 mr-2" />
                                    Import CSV
                                    <input type="file" accept=".csv" className="hidden" onChange={handlePartyImport} />
                                </label>
                            </div>

                            <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => setShowAddPartyModal(false)} className="px-4 py-2 text-gray-600">Cancel</button>
                                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Save</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* WhatsApp Modal */}



            {/* 1. PRINTABLE BILL (Bluetic High-Density - Used for Image/PDF capture) */}
            <div id="printable-bill" className="hidden-print bg-white p-8 text-black font-sans relative pdf-page" style={{ position: 'absolute', left: '-10000px', width: '1200px' }}>
                {/* Ultra-Compact Bluetic Header */}
                <div className="bg-blue-900 text-white p-4 flex justify-between items-center rounded-t-lg mb-4">
                    <div className="flex items-baseline space-x-6">
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase font-bold text-blue-300 tracking-widest">Customer</span>
                            <span className="text-3xl font-black uppercase tracking-tight leading-none">{billDetails.customerName}</span>
                        </div>
                        <div className="h-10 w-px bg-blue-700"></div>
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase font-bold text-blue-300 tracking-widest">Station</span>
                            <span className="text-2xl font-bold uppercase leading-none">{billDetails.customerStation || '-'}</span>
                        </div>
                    </div>
                    <div className="text-right flex items-center space-x-8">
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase font-bold text-blue-300 tracking-widest">Bill Date</span>
                            <span className="text-2xl font-black leading-none">{billDetails.date}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase font-bold text-blue-300 tracking-widest">Bill No</span>
                            <span className="text-2xl font-black leading-none">{billDetails.billNo || 'DRAFT'}</span>
                        </div>
                    </div>
                </div>

                {/* Section A: Detailed Item List (Precise Layout) */}
                <div className="mb-6 border border-blue-100 rounded-lg overflow-hidden">
                    <div className="bg-blue-50 px-4 py-2 border-b border-blue-100 flex justify-between items-center">
                        <h3 className="text-xl font-black uppercase text-blue-900 tracking-wider">Detailed Item Entries</h3>
                        <span className="text-sm font-bold text-blue-500 uppercase">{billItems.filter(i => i.itemName).length} Items</span>
                    </div>
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-blue-100/50 text-left text-2xl font-black uppercase text-blue-900 border-b border-blue-200">
                                <th className="py-[15px] px-6" style={{ width: '30%' }}>Item Description</th>
                                <th className="py-[15px] text-center" style={{ width: '23%' }}>Quantity</th>
                                <th className="py-[15px] text-center" style={{ width: '23%' }}>U.Cap</th>
                                <th className="py-[15px] text-center" style={{ width: '23%' }}>L.Cap</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y-2 divide-blue-100">
                            {billItems.filter(i => i.itemName).map((item, idx) => (
                                <tr key={idx} className="text-4xl font-bold bg-white">
                                    <td className="py-[15px] px-6 uppercase tracking-tight">
                                        <span className="text-blue-300 italic text-2xl mr-4">{idx + 1}</span>
                                        {item.itemName}
                                    </td>
                                    <td className="py-[15px] text-center font-black text-blue-900 bg-blue-50/20 border-l-2 border-blue-100">{item.qty}</td>
                                    <td className="py-[15px] text-center text-blue-900 font-black border-l-2 border-blue-100">{item.uCap || '-'}</td>
                                    <td className="py-[15px] text-center text-blue-900 font-black border-l-2 border-blue-100">{item.lCap || '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Section B: Group Summary (Precise Layout) */}
                <div className="mb-6 border border-blue-100 rounded-lg overflow-hidden">
                    <div className="bg-blue-50 px-4 py-2 border-b border-blue-100">
                        <h3 className="text-xl font-black uppercase text-blue-900 tracking-wider">Group Wise Financial Summary</h3>
                    </div>
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-blue-100/50 text-left text-2xl font-black uppercase text-blue-900 border-b border-blue-200">
                                <th className="py-[15px] px-6" style={{ width: '30%' }}>Particulars</th>
                                <th className="py-[15px] text-center" style={{ width: '20%' }}>Qty</th>
                                <th className="py-[15px] text-center" style={{ width: '20%' }}>Rate</th>
                                <th className="py-[15px] text-center px-6" style={{ width: '30%' }}>Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y-2 divide-blue-100">
                            {combinedSummary.map((s, i) => (
                                <tr key={i} className="text-3xl font-bold bg-white">
                                    <td className="py-[15px] px-6 text-blue-900">{s.name}</td>
                                    <td className="py-[15px] text-center font-black border-l-2 border-blue-100">{s.qty}</td>
                                    <td className="py-[15px] text-center text-black font-black border-l-2 border-blue-100">₹{s.rate.toFixed(2)}</td>
                                    <td className="py-[15px] text-center text-4xl font-black px-6 text-blue-900 bg-blue-50/30 border-l-2 border-blue-100">₹{s.total.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="mt-12 px-10">
                    <div className="border-t-8 border-blue-900 pt-8 flex justify-end">
                        <div className="w-1/2 space-y-4">
                            <div className="flex justify-between text-3xl font-black text-blue-900/50">
                                <span>Total Goods Value</span>
                                <span>₹{sumOfItems.toFixed(2)}</span>
                            </div>
                            {adjustments.map((adj, i) => (
                                <div key={i} className="flex justify-between text-3xl font-black">
                                    <span className="text-blue-900">{adj.type === 'add' ? 'ADD' : 'LESS'}: {adj.desc}</span>
                                    <span className={adj.type === 'add' ? 'text-green-600' : 'text-red-500'}>{adj.type === 'add' ? '+' : '-'}{parseFloat(adj.amount || 0).toFixed(2)}</span>
                                </div>
                            ))}
                            <div className="bg-blue-900 text-white p-8 flex justify-between items-center mt-6 rounded-2xl shadow-xl border-4 border-blue-800">
                                <span className="text-4xl font-black uppercase tracking-tighter text-blue-200">{grandTotalLabel}</span>
                                <span className="text-4xl font-black">₹{grandTotal.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div id="summary-bill-pages-container" className="hidden-print" style={{ position: 'absolute', left: '-10000px', width: '1200px' }}>
                {(() => {
                    const items = billItems.filter(i => i.itemName);
                    const pages = [];
                    const p1Limit = 22;
                    const p2Limit = 22;

                    if (items.length <= p1Limit) {
                        pages.push(items);
                    } else {
                        pages.push(items.slice(0, p1Limit));
                        for (let i = p1Limit; i < items.length; i += p2Limit) {
                            pages.push(items.slice(i, i + p2Limit));
                        }
                    }
                    if (pages.length === 0) pages.push([]);

                    const jsxPages = pages.map((pageItems, pidx) => (
                        <div key={`item-page-${pidx}`} className="bg-white p-8 font-sans relative pdf-page flex flex-col" style={{ width: '1200px', height: '1697px', pageBreakAfter: 'always' }}>
                            {/* Header - Only on First Page */}
                            {pidx === 0 && (
                                <div className="bg-blue-900 text-white p-4 flex justify-between items-center rounded-t-lg mb-4">
                                    <div className="flex items-baseline space-x-6">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] uppercase font-bold text-blue-300 tracking-widest">Customer</span>
                                            <span className="text-3xl font-black uppercase tracking-tight leading-none">{billDetails.customerName}</span>
                                        </div>
                                        <div className="h-10 w-px bg-blue-700"></div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] uppercase font-bold text-blue-300 tracking-widest">Station</span>
                                            <span className="text-2xl font-bold uppercase leading-none">{billDetails.customerStation || '-'}</span>
                                        </div>
                                    </div>
                                    <div className="text-right flex items-center space-x-8">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] uppercase font-bold text-blue-300 tracking-widest">Date</span>
                                            <span className="text-2xl font-black leading-none">{billDetails.date}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] uppercase font-bold text-blue-300 tracking-widest">Page</span>
                                            <span className="text-2xl font-black leading-none">{pidx + 1}/{pages.length + 1}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Minimal Header for Page 2+ */}
                            {pidx > 0 && (
                                <div className="flex justify-between items-center mb-4 pb-2 border-b-2 border-blue-900">
                                    <span className="text-xl font-black text-blue-900 uppercase tracking-widest">Summary Bill - {billDetails.customerName} (Cont.)</span>
                                    <span className="text-xl font-bold text-blue-700">Page {pidx + 1} of {pages.length + 1}</span>
                                </div>
                            )}

                            {/* Items List for this page */}
                            <div className="mb-6 border border-blue-100 rounded-lg overflow-visible">
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr className="bg-blue-100/50 text-left text-2xl font-black uppercase text-blue-900 border-b border-blue-200">
                                            <th className="py-[15px] px-6 border-r-2 border-blue-100" style={{ width: '10%' }}>Sr.</th>
                                            <th className="py-[15px] px-6" style={{ width: '25%' }}>Item Description</th>
                                            <th className="py-[15px] text-center border-l border-blue-100" style={{ width: '21.5%' }}>Quantity</th>
                                            <th className="py-[15px] text-center border-l border-blue-100" style={{ width: '21.5%' }}>U.Cap</th>
                                            <th className="py-[15px] text-center border-l border-blue-100" style={{ width: '21.5%' }}>L.Cap</th>
                                        </tr>
                                    </thead>
                                    <tbody className="">
                                        {Array.from({ length: 22 }).map((_, iidx) => {
                                            const item = pageItems[iidx];
                                            return (
                                                <tr key={iidx} className={`text-4xl font-bold bg-white border-b-2 border-blue-100 ${iidx === 21 ? 'border-b-0' : ''}`}>
                                                    <td className="py-[8px] px-6 uppercase tracking-tight border-r-2 border-blue-100">
                                                        <span className="text-blue-300 italic text-2xl mr-4">{item ? items.indexOf(item) + 1 : ""}</span>
                                                    </td>
                                                    <td className="py-[8px] px-6 uppercase tracking-tight">
                                                        {item?.itemName || ""}
                                                    </td>
                                                    <td className="py-[8px] text-center font-black text-blue-900 bg-blue-50/20 border-l-2 border-blue-100">{item?.qty || ""}</td>
                                                    <td className="py-[8px] text-center text-blue-900 font-black border-l-2 border-blue-100">{item?.uCap || ""}</td>
                                                    <td className="py-[8px] text-center text-blue-900 font-black border-l-2 border-blue-100">{item?.lCap || ""}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ));

                    // ADD DEDICATED SUMMARY PAGE
                    jsxPages.push(
                        <div key="summary-page" className="bg-white p-8 font-sans relative pdf-page flex flex-col" style={{ width: '1200px', height: '1697px', pageBreakAfter: 'always' }}>
                            {/* Summary Header */}
                            <div className="bg-blue-900 text-white p-4 flex justify-between items-center rounded-t-lg mb-6">
                                <div className="flex items-center space-x-4">
                                    <div className="bg-blue-800 p-2 rounded-lg">
                                        <span className="text-xl font-black uppercase tracking-widest text-blue-100">Bill Summary & Totals</span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] uppercase font-bold text-blue-300 tracking-widest">Page</span>
                                    <span className="text-2xl font-black leading-none ml-3">{pages.length + 1}/{pages.length + 1}</span>
                                </div>
                            </div>

                            <div className="mb-6 border border-blue-100 rounded-lg overflow-visible">
                                <div className="bg-blue-50 px-4 py-2 border-b border-blue-100">
                                    <h3 className="text-2xl font-black uppercase text-blue-900 tracking-wider">Group Wise Breakdown</h3>
                                </div>
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr className="bg-blue-100/50 text-left text-2xl font-black uppercase text-blue-900 border-b border-blue-200">
                                            <th className="py-[15px] px-6" style={{ width: '30%' }}>Particulars</th>
                                            <th className="py-[15px] text-center" style={{ width: '20%' }}>Qty</th>
                                            <th className="py-[15px] text-center" style={{ width: '20%' }}>Rate</th>
                                            <th className="py-[15px] text-center px-6" style={{ width: '30%' }}>Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-blue-50">
                                        {combinedSummary.map((s, i) => (
                                            <tr key={i} className="text-3xl font-bold bg-white">
                                                <td className="py-3 px-6 text-blue-900">{s.name}</td>
                                                <td className="py-3 text-center font-black border-l-2 border-blue-100">{s.qty}</td>
                                                <td className="py-3 text-center text-black font-black border-l-2 border-blue-100">₹{s.rate.toFixed(2)}</td>
                                                <td className="py-3 text-center text-4xl font-black px-6 text-blue-900 bg-blue-50/30 border-l-2 border-blue-100">₹{s.total.toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-auto pt-10 px-2">
                                <div className="border-t-4 border-blue-900 pt-6 flex justify-end">
                                    <div className="w-1/2 space-y-3">
                                        <div className="flex justify-between text-2xl font-bold text-blue-900/50">
                                            <span>Goods Value</span>
                                            <span>₹{sumOfItems.toFixed(2)}</span>
                                        </div>
                                        {adjustments.map((adj, i) => (
                                            <div key={i} className="flex justify-between text-2xl font-bold">
                                                <span className="text-blue-900">{adj.type === 'add' ? 'ADD' : 'LESS'}: {adj.desc}</span>
                                                <span className={adj.type === 'add' ? 'text-green-600' : 'text-red-500'}>{adj.type === 'add' ? '+' : '-'}{parseFloat(adj.amount || 0).toFixed(2)}</span>
                                            </div>
                                        ))}
                                        <div className="bg-blue-900 text-white p-6 flex justify-between items-center mt-4 rounded-xl shadow-xl">
                                            <span className="text-3xl font-black uppercase text-blue-200">{grandTotalLabel}</span>
                                            <span className="text-4xl font-black">₹{grandTotal.toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );

                    return jsxPages;
                })()}
            </div>

            <div id="pdf-pages-container" className="hidden-print" style={{ position: 'absolute', left: '-10000px', width: '1200px' }}>
                {(() => {
                    const items = billItems.filter(i => i.itemName);
                    const pages = [];
                    const p1Limit = 22;
                    const p2Limit = 22;

                    if (items.length <= p1Limit) {
                        pages.push(items);
                    } else {
                        pages.push(items.slice(0, p1Limit));
                        for (let i = p1Limit; i < items.length; i += p2Limit) {
                            pages.push(items.slice(i, i + p2Limit));
                        }
                    }
                    if (pages.length === 0) pages.push([]);

                    return pages.map((pageItems, idx) => (
                        <div key={idx} id={`pdf-page-${idx}`} className="bg-white p-8 font-sans relative pdf-page flex flex-col" style={{ width: '1200px', height: '1697px', pageBreakAfter: 'always' }}>
                            {/* Header - Only on First Page */}
                            {idx === 0 && (
                                <div className="bg-blue-900 text-white p-4 flex justify-between items-center rounded-t-lg mb-4">
                                    <div className="flex items-baseline space-x-6">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] uppercase font-bold text-blue-300 tracking-widest">Customer</span>
                                            <span className="text-3xl font-black uppercase tracking-tight leading-none">{billDetails.customerName}</span>
                                        </div>
                                        <div className="h-10 w-px bg-blue-700"></div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] uppercase font-bold text-blue-300 tracking-widest">Station</span>
                                            <span className="text-2xl font-bold uppercase leading-none">{billDetails.customerStation || '-'}</span>
                                        </div>
                                        <div className="h-10 w-px bg-blue-700"></div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] uppercase font-bold text-blue-300 tracking-widest">Vehicle No</span>
                                            <span className="text-2xl font-black uppercase leading-none">{billDetails.vehicleNo || 'N/A'}</span>
                                        </div>
                                    </div>
                                    <div className="text-right flex items-center space-x-8">
                                        <div className="flex flex-col text-left">
                                            <span className="text-[10px] uppercase font-bold text-blue-300 tracking-widest">Slip Date</span>
                                            <span className="text-2xl font-black leading-none">{billDetails.date}</span>
                                        </div>
                                        <div className="flex flex-col text-left">
                                            <span className="text-[10px] uppercase font-bold text-blue-300 tracking-widest">Slip No / Page</span>
                                            <span className="text-2xl font-black leading-none truncate max-w-[120px]">{billDetails.billNo || 'DRAFT'} <span className="text-blue-400 font-bold ml-1">#{idx + 1}</span></span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Minimal Continuation Header for Page 2+ */}
                            {idx > 0 && (
                                <div className="flex justify-between items-center mb-4 pb-2 border-b-2 border-blue-900">
                                    <span className="text-xl font-black text-blue-900 uppercase tracking-widest">Packing Slip - {billDetails.customerName} (Cont.)</span>
                                    <span className="text-xl font-bold text-blue-700">Page {idx + 1} of {pages.length}</span>
                                </div>
                            )}

                            <div className="border-2 border-blue-900 rounded-lg overflow-hidden">
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr className="bg-blue-900 text-white text-left text-2xl font-black uppercase tracking-wider">
                                            <th className="py-[15px] px-6 border-r-2 border-blue-800" style={{ width: '10%' }}>Sr.</th>
                                            <th className="py-[15px] px-6" style={{ width: '25%' }}>Item Description</th>
                                            <th className="py-[15px] text-center border-l-2 border-blue-800" style={{ width: '21.5%' }}>Quantity</th>
                                            <th className="py-[15px] text-center border-l-2 border-blue-800" style={{ width: '21.5%' }}>U.Cap</th>
                                            <th className="py-[15px] text-center border-l-2 border-blue-800" style={{ width: '21.5%' }}>L.Cap</th>
                                        </tr>
                                    </thead>
                                    <tbody className="">
                                        {Array.from({ length: 22 }).map((_, pidx) => {
                                            const item = pageItems[pidx];
                                            return (
                                                <tr key={pidx} className={`text-3xl font-bold bg-white border-b-2 border-blue-900 ${pidx === 21 ? 'border-b-0' : ''}`}>
                                                    <td className="py-2 px-6 uppercase text-blue-900 tracking-tight border-r-2 border-blue-900">
                                                        <span className="text-blue-400 italic text-xl mr-5">{item ? items.indexOf(item) + 1 : ""}</span>
                                                    </td>
                                                    <td className="py-2 px-6 uppercase text-blue-900 tracking-tight">
                                                        {item?.itemName || ""}
                                                    </td>
                                                    <td className="py-2 text-center font-black text-blue-900 bg-blue-50/10 border-l-2 border-blue-900">{item?.qty || ""}</td>
                                                    <td className="py-2 text-center text-blue-900 font-black border-l-2 border-blue-900">{item?.uCap || ""}</td>
                                                    <td className="py-2 text-center text-blue-900 font-black border-l-2 border-blue-900">{item?.lCap || ""}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {idx === pages.length - 1 && (
                                <div className="mt-auto pt-10 px-2 border-t-4 border-blue-900">
                                    <div className="flex justify-between items-center bg-blue-50 p-4 border-2 border-blue-900 rounded-xl">
                                        <span className="text-2xl font-black uppercase text-blue-900 tracking-tighter">TOTAL SLIP QUANTITY:</span>
                                        <span className="text-4xl font-black text-blue-900">{items.reduce((acc, i) => acc + (parseFloat(i.qty) || 0), 0)}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    ));
                })()}
            </div>

            {/* 3. CONTINUOUS SLIP CONTAINER (Used for Image/Clipboard capture) */}
            <div id="printable-slip" className="hidden-print bg-white p-8 text-black font-sans relative" style={{ position: 'absolute', left: '-10000px', width: '1200px' }}>
                <div className="bg-blue-900 text-white p-4 flex justify-between items-center rounded-t-lg mb-4">
                    <div className="flex items-baseline space-x-6">
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase font-bold text-blue-300 tracking-widest">Customer</span>
                            <span className="text-3xl font-black uppercase tracking-tight leading-none">{billDetails.customerName}</span>
                        </div>
                        <div className="h-10 w-px bg-blue-700"></div>
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase font-bold text-blue-300 tracking-widest">Station</span>
                            <span className="text-2xl font-bold uppercase leading-none">{billDetails.customerStation || '-'}</span>
                        </div>
                        <div className="h-10 w-px bg-blue-700"></div>
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase font-bold text-blue-300 tracking-widest">Vehicle No</span>
                            <span className="text-2xl font-black uppercase leading-none">{billDetails.vehicleNo || 'N/A'}</span>
                        </div>
                    </div>
                    <div className="text-right flex items-center space-x-8">
                        <div className="flex flex-col text-left">
                            <span className="text-[10px] uppercase font-bold text-blue-300 tracking-widest">Slip Date</span>
                            <span className="text-2xl font-black leading-none">{billDetails.date}</span>
                        </div>
                        <div className="flex flex-col text-left">
                            <span className="text-[10px] uppercase font-bold text-blue-300 tracking-widest">Slip No / Page</span>
                            <span className="text-2xl font-black leading-none truncate max-w-[120px]">{billDetails.billNo || 'DRAFT'}</span>
                        </div>
                    </div>
                </div>

                <div className="border-2 border-blue-900 rounded-lg overflow-hidden">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-blue-900 text-white text-left text-2xl font-black uppercase tracking-wider">
                                <th className="py-[15px] px-6" style={{ width: '30%' }}>Item Description</th>
                                <th className="py-[15px] text-center border-l-2 border-blue-800" style={{ width: '23%' }}>Quantity</th>
                                <th className="py-[15px] text-center border-l-2 border-blue-800" style={{ width: '23%' }}>U.Cap</th>
                                <th className="py-[15px] text-center border-l-2 border-blue-800" style={{ width: '23%' }}>L.Cap</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y-2 divide-blue-900">
                            {billItems.filter(i => i.itemName).map((item, idx) => (
                                <tr key={idx} className="text-3xl font-bold bg-white">
                                    <td className="py-3 px-6 uppercase text-blue-900 tracking-tight">
                                        <span className="text-blue-400 italic text-xl mr-5">{idx + 1}</span>
                                        {item.itemName}
                                    </td>
                                    <td className="py-3 text-center font-black text-blue-900 bg-blue-50/10 border-l-2 border-blue-900">{item.qty}</td>
                                    <td className="py-3 text-center text-blue-900 font-black border-l-2 border-blue-900">{item.uCap || '-'}</td>
                                    <td className="py-3 text-center text-blue-900 font-black border-l-2 border-blue-900">{item.lCap || '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="mt-8 pt-10 px-2 border-t-4 border-blue-900">
                    <div className="flex justify-between items-center bg-blue-50 p-4 border-2 border-blue-900 rounded-xl">
                        <span className="text-2xl font-black uppercase text-blue-900 tracking-tighter">TOTAL SLIP QUANTITY:</span>
                        <span className="text-4xl font-black text-blue-900">{billItems.filter(i => i.itemName).reduce((acc, i) => acc + (parseFloat(i.qty) || 0), 0)}</span>
                    </div>
                </div>
            </div>



            {/* BILL PREVIEW MODAL */}
            {
                showPreviewModal && (
                    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
                            <div className="flex justify-between items-center px-8 py-6 border-b-2 border-gray-100 bg-gray-50/50">
                                <div>
                                    <h3 className="text-3xl font-black uppercase tracking-tight text-gray-900">Summary Bill Preview</h3>
                                    <p className="text-gray-500 font-bold">Verify items summary and financial details</p>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-0 rounded-xl overflow-hidden shadow-xl border border-blue-700">
                                        <button
                                            onClick={() => handleSavePDF('normal', 'print')}
                                            className="px-6 py-3 bg-blue-700 text-white hover:bg-blue-800 font-black flex items-center transition-all border-r border-blue-600"
                                            title="Print Directly"
                                        >
                                            <Printer className="h-5 w-5 mr-3" /> PRINT NOW
                                        </button>
                                        <button
                                            onClick={() => setShowExportMenu(showExportMenu === 'bill' ? null : 'bill')}
                                            className="px-4 py-3 bg-blue-600 text-white hover:bg-blue-700 transition-all flex items-center"
                                            title="More Export Options"
                                        >
                                            <ChevronDown className={`h-5 w-5 transform transition-transform ${showExportMenu === 'bill' ? 'rotate-180' : ''}`} />
                                        </button>

                                        {showExportMenu === 'bill' && (
                                            <div className="absolute right-0 mt-36 w-56 bg-white rounded-2xl shadow-2xl border border-gray-100 z-[60] py-3 animate-in fade-in slide-in-from-top-4 duration-300 overflow-hidden">
                                                <button onClick={() => { handleCopyText('normal'); setShowExportMenu(null); }} className="w-full text-left px-5 py-3 hover:bg-blue-50 flex items-center text-gray-700 font-bold transition-colors">
                                                    <Copy className="h-5 w-5 mr-4 text-blue-500" /> Copy Text
                                                </button>
                                                <button onClick={() => { handleSavePDF('normal', 'save'); setShowExportMenu(null); }} className="w-full text-left px-5 py-3 hover:bg-blue-50 flex items-center text-gray-700 font-bold transition-colors">
                                                    <Download className="h-5 w-5 mr-4 text-purple-600" /> Save PDF
                                                </button>
                                                <button onClick={() => { handleDownloadImage('normal'); setShowExportMenu(null); }} className="w-full text-left px-5 py-3 hover:bg-blue-50 flex items-center text-gray-700 font-bold transition-colors">
                                                    <Download className="h-5 w-5 mr-4 text-emerald-600" /> Save Image
                                                </button>
                                                <button onClick={() => { handleCopyImage('normal'); setShowExportMenu(null); }} className="w-full text-left px-5 py-3 hover:bg-blue-50 flex items-center text-gray-700 font-bold transition-colors">
                                                    <Copy className="h-5 w-5 mr-4 text-orange-500" /> Copy Image
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <button onClick={() => setShowPreviewModal(false)} className="bg-gray-200 p-3 rounded-full hover:bg-red-500 hover:text-white transition-all">
                                        <X className="h-6 w-6 font-black" />
                                    </button>
                                </div>
                            </div>

                            <div className="flex-grow overflow-auto p-12 bg-gray-50 flex justify-center">
                                <div className="bg-white shadow-2xl p-10 border border-gray-100 rounded-xl" style={{ width: '850px' }}>
                                    {/* Bluetic Header Bar */}
                                    <div className="bg-blue-900 text-white p-3 flex justify-between items-center rounded-t-lg mb-6">
                                        <div className="flex items-center space-x-4">
                                            <div className="flex flex-col">
                                                <span className="text-[8px] uppercase font-bold text-blue-300 tracking-widest leading-none mb-1">Customer</span>
                                                <span className="text-xl font-black uppercase tracking-tight leading-none">{billDetails.customerName}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center space-x-6 text-right">
                                            <div className="flex flex-col">
                                                <span className="text-[8px] uppercase font-bold text-blue-300 tracking-widest leading-none mb-1">Date</span>
                                                <span className="text-sm font-bold leading-none">{billDetails.date}</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[8px] uppercase font-bold text-blue-300 tracking-widest leading-none mb-1">No</span>
                                                <span className="text-sm font-bold leading-none">{billDetails.billNo || 'DRAFT'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Detailed Items Table */}
                                    <div className="mb-6 border border-blue-50 rounded-lg overflow-hidden">
                                        <div className="bg-blue-50 px-3 py-1 border-b border-blue-100 flex justify-between">
                                            <h4 className="text-[10px] font-black uppercase text-blue-800">Item Entries</h4>
                                            <span className="text-[10px] font-bold text-blue-400">#{billItems.filter(i => i.itemName).length} rows</span>
                                        </div>
                                        <table className="w-full border-collapse text-base">
                                            <thead>
                                                <tr className="bg-blue-100/30 text-left text-lg font-black uppercase text-blue-900 border-b border-blue-50">
                                                    <th className="py-[9px] px-4" style={{ width: '30%' }}>Description</th>
                                                    <th className="py-[9px] text-center" style={{ width: '23%' }}>Qty</th>
                                                    <th className="py-[9px] text-center" style={{ width: '23%' }}>U.C</th>
                                                    <th className="py-[9px] text-center" style={{ width: '23%' }}>L.C</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y-2 divide-blue-100">
                                                {billItems.filter(i => i.itemName).map((item, idx) => (
                                                    <tr key={idx} className="font-bold border-gray-50 text-2xl bg-white">
                                                        <td className="py-[14px] px-6 uppercase tracking-tight border-r-2 border-blue-100">
                                                            <span className="text-blue-300 italic text-2xl mr-4">{items.indexOf(item) + 1}</span>
                                                            {item.itemName}
                                                        </td>
                                                        <td className="py-[9px] text-center font-black text-blue-900 bg-blue-50/10">{item.qty}</td>
                                                        <td className="py-[9px] text-center text-blue-900 font-black">{item.uCap || '-'}</td>
                                                        <td className="py-[9px] text-center text-blue-900 font-black">{item.lCap || '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Summary Table */}
                                    <div className="mb-6 border border-blue-100 rounded-lg overflow-hidden">
                                        <div className="bg-gray-50 px-3 py-1 border-b border-gray-100 text-[10px] font-black uppercase text-gray-500">
                                            Financial Summary
                                        </div>
                                        <table className="w-full border-collapse">
                                            <thead>
                                                <tr className="bg-white text-left text-xl font-black uppercase border-b-2 border-blue-900">
                                                    <th className="py-3 px-4" style={{ width: '30%' }}>Particulars</th>
                                                    <th className="py-3 text-center" style={{ width: '20%' }}>Qty</th>
                                                    <th className="py-3 text-center" style={{ width: '20%' }}>Rate</th>
                                                    <th className="py-3 text-center px-4" style={{ width: '30%' }}>Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y border-b-2 border-blue-900">
                                                {combinedSummary.map((s, i) => (
                                                    <tr key={i} className="text-lg font-bold bg-white">
                                                        <td className="py-[9px] px-4 text-blue-900">{s.name}</td>
                                                        <td className="py-[9px] text-center font-black">{s.qty}</td>
                                                        <td className="py-[9px] text-center text-black font-black">₹{s.rate.toFixed(2)}</td>
                                                        <td className="py-[9px] text-center font-black px-4 text-blue-900 bg-blue-50/20">₹{s.total.toFixed(2)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="flex flex-col items-end space-y-3">
                                        <div className="flex justify-between w-80 text-lg font-bold text-gray-400">
                                            <span>Items Value</span>
                                            <span>₹{sumOfItems.toFixed(2)}</span>
                                        </div>
                                        {adjustments.map((adj, i) => (
                                            <div key={i} className="flex justify-between w-80 text-lg font-bold">
                                                <span className={adj.type === 'add' ? 'text-green-600' : 'text-red-500'}>
                                                    {adj.type === 'add' ? '+' : '-'} {adj.desc}
                                                </span>
                                                <span>₹{parseFloat(adj.amount || 0).toFixed(2)}</span>
                                            </div>
                                        ))}
                                        <div className="w-full md:w-96 mt-6 bg-blue-900 text-white p-6 rounded-2xl flex justify-between items-center shadow-xl border-4 border-blue-800">
                                            <div>
                                                <span className="block text-xs font-black uppercase text-blue-300 tracking-widest mb-1">Final Total</span>
                                                <span className="text-xl font-black uppercase tracking-tight leading-none text-blue-200">{grandTotalLabel}</span>
                                            </div>
                                            <div className="flex items-center">
                                                <span className="text-2xl font-bold mr-1 text-blue-300">₹</span>
                                                <input
                                                    type="number"
                                                    className="text-4xl font-black w-48 bg-transparent text-right outline-none focus:ring-0"
                                                    value={overrideBalance !== null ? overrideBalance : grandTotal.toFixed(2)}
                                                    onChange={(e) => setOverrideBalance(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        {overrideBalance !== null && (
                                            <button onClick={() => setOverrideBalance(null)} className="text-[10px] font-black text-blue-600 uppercase hover:underline">Reset to total</button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* SLIP PREVIEW MODAL */}
            {
                showSlipPreviewModal && (
                    <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-6 backdrop-blur-md">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
                            <div className="flex justify-between items-center px-8 py-6 border-b-2 border-gray-100 bg-gray-50/50">
                                <div>
                                    <h3 className="text-3xl font-black uppercase tracking-tight text-gray-900">Packing Slip Preview</h3>
                                    <p className="text-gray-500 font-bold">Check item entry details and vehicle No</p>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-0 rounded-xl overflow-hidden shadow-xl border border-teal-700">
                                        <button
                                            onClick={() => handleSavePDF('slip', 'print')}
                                            className="px-6 py-3 bg-teal-700 text-white hover:bg-teal-800 font-black flex items-center transition-all border-r border-teal-600"
                                            title="Print Directly"
                                        >
                                            <Printer className="h-5 w-5 mr-3" /> PRINT NOW
                                        </button>
                                        <button
                                            onClick={() => setShowExportMenu(showExportMenu === 'slip' ? null : 'slip')}
                                            className="px-4 py-3 bg-teal-600 text-white hover:bg-teal-700 transition-all flex items-center"
                                            title="More Export Options"
                                        >
                                            <ChevronDown className={`h-5 w-5 transform transition-transform ${showExportMenu === 'slip' ? 'rotate-180' : ''}`} />
                                        </button>

                                        {showExportMenu === 'slip' && (
                                            <div className="absolute right-0 mt-36 w-56 bg-white rounded-2xl shadow-2xl border border-gray-100 z-[60] py-3 animate-in fade-in slide-in-from-top-4 duration-300 overflow-hidden">
                                                <button onClick={() => { handleCopyText('slip'); setShowExportMenu(null); }} className="w-full text-left px-5 py-3 hover:bg-teal-50 flex items-center text-gray-700 font-bold transition-colors">
                                                    <Copy className="h-5 w-5 mr-4 text-blue-500" /> Copy Text
                                                </button>
                                                <button onClick={() => { handleSavePDF('slip', 'save'); setShowExportMenu(null); }} className="w-full text-left px-5 py-3 hover:bg-teal-50 flex items-center text-gray-700 font-bold transition-colors">
                                                    <Download className="h-5 w-5 mr-4 text-purple-600" /> Save PDF
                                                </button>
                                                <button onClick={() => { handleDownloadImage('slip'); setShowExportMenu(null); }} className="w-full text-left px-5 py-3 hover:bg-teal-50 flex items-center text-gray-700 font-bold transition-colors">
                                                    <Download className="h-5 w-5 mr-4 text-emerald-600" /> Save Image
                                                </button>
                                                <button onClick={() => { handleCopyImage('slip'); setShowExportMenu(null); }} className="w-full text-left px-5 py-3 hover:bg-teal-50 flex items-center text-gray-700 font-bold transition-colors">
                                                    <Copy className="h-5 w-5 mr-4 text-orange-500" /> Copy Image
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <button onClick={() => setShowSlipPreviewModal(false)} className="bg-gray-200 p-3 rounded-full hover:bg-red-500 hover:text-white transition-all">
                                        <X className="h-6 w-6 font-black" />
                                    </button>
                                </div>
                            </div>

                            <div className="flex-grow overflow-auto p-12 bg-gray-100 flex justify-center">
                                <div className="bg-white shadow-2xl p-10 border border-gray-100 rounded-xl" style={{ width: '900px' }}>
                                    {/* Bluetic Header Bar for Preview */}
                                    <div className="bg-blue-900 text-white p-3 flex justify-between items-center rounded-t-lg mb-6">
                                        <div className="flex items-center space-x-6">
                                            <div className="flex flex-col">
                                                <span className="text-[8px] uppercase font-bold text-blue-300 tracking-widest mb-1">Customer</span>
                                                <span className="text-xl font-black uppercase tracking-tight leading-none">{billDetails.customerName}</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[8px] uppercase font-bold text-blue-300 tracking-widest mb-1">Vehicle</span>
                                                <span className="text-xl font-black uppercase tracking-tight leading-none">{billDetails.vehicleNo || 'N/A'}</span>
                                            </div>
                                        </div>
                                        <div className="text-right flex items-center space-x-8">
                                            <div className="flex flex-col">
                                                <span className="text-[8px] uppercase font-bold text-blue-300 tracking-widest mb-1">Date</span>
                                                <span className="text-sm font-bold leading-none">{billDetails.date}</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[8px] uppercase font-bold text-blue-300 tracking-widest mb-1">Ref No</span>
                                                <span className="text-sm font-bold leading-none">{billDetails.billNo || 'DRAFT'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="border border-blue-100 rounded-lg overflow-hidden">
                                        <table className="w-full border-collapse">
                                            <thead>
                                                <tr className="bg-blue-900 text-white text-left text-lg font-black uppercase tracking-wider border-b border-blue-800">
                                                    <th className="py-3 px-4" style={{ width: '30%' }}>Item Name</th>
                                                    <th className="py-3 text-center" style={{ width: '23%' }}>Qty</th>
                                                    <th className="py-3 text-center border-l border-blue-800" style={{ width: '23%' }}>U.C</th>
                                                    <th className="py-3 text-center border-l border-blue-800" style={{ width: '23%' }}>L.C</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-blue-50">
                                                {billItems.filter(i => i.itemName).map((item, idx) => (
                                                    <tr key={idx} className="text-lg font-bold bg-white">
                                                        <td className="py-3 px-4 uppercase text-blue-900 tracking-tight">
                                                            <span className="text-blue-300 italic text-xs mr-3">{idx + 1}</span>
                                                            {item.itemName}
                                                        </td>
                                                        <td className="py-3 text-center font-black text-blue-900 bg-blue-50/10">{item.qty}</td>
                                                        <td className="py-3 text-center text-blue-900 font-black border-l border-blue-50">{item.uCap || '-'}</td>
                                                        <td className="py-3 text-center text-blue-900 font-black border-l border-blue-50">{item.lCap || '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="mt-8 pt-6 border-t-2 border-blue-100 flex justify-between items-center px-4 bg-blue-50 py-4 rounded-xl">
                                        <span className="text-sm font-black uppercase text-blue-400">Total Items Quantity:</span>
                                        <span className="text-3xl font-black text-blue-900 font-mono tracking-tighter">{billItems.reduce((acc, i) => acc + (parseFloat(i.qty) || 0), 0)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Shortcuts Help */}
            {
                showShortcuts && (
                    <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-6 backdrop-blur-sm">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100">
                            <div className="bg-blue-600 p-8 text-white">
                                <h3 className="text-3xl font-black flex items-center uppercase tracking-tight">
                                    <Keyboard className="h-8 w-8 mr-4" /> Keyboard Power
                                </h3>
                                <p className="mt-2 text-blue-100 font-bold uppercase text-xs tracking-widest">Master your workflow with shortcuts</p>
                            </div>
                            <div className="p-8 space-y-4">
                                {[
                                    { k: 'Alt + N', d: 'Add New Item Row' },
                                    { k: 'Alt + C', d: 'Create Master Item' },
                                    { k: 'Alt + V', d: 'Preview Summary Bill' },
                                    { k: 'Alt + S', d: 'Save Current Bill' },
                                    { k: 'Alt + L', d: 'Load Previous Bills' },
                                    { k: 'Alt + P', d: 'Preview Packing Slip' },
                                    { k: 'Alt + H', d: 'Show This Help' }
                                ].map((s, i) => (
                                    <div key={i} className="flex justify-between items-center p-4 bg-gray-50 rounded-xl border border-gray-100 group hover:border-blue-200 transition-all">
                                        <span className="text-gray-600 font-black uppercase text-sm tracking-tight">{s.d}</span>
                                        <span className="font-mono bg-white px-3 py-1 rounded-lg border-2 border-gray-200 font-black text-blue-600 shadow-sm group-hover:border-blue-500 transition-all">{s.k}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="p-8 pt-0 text-center">
                                <button onClick={() => setShowShortcuts(false)} className="px-10 py-4 bg-gray-900 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-black transition-all shadow-xl w-full">Got It</button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Create New Item Modal */}
            {
                showAddItemModal && (
                    <div className="fixed inset-0 bg-black/70 z-[80] flex items-center justify-center p-6 backdrop-blur-sm">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden border-2 border-white">
                            <div className="bg-gray-900 p-8 text-white flex justify-between items-center">
                                <div>
                                    <h3 className="text-3xl font-black uppercase tracking-tight">Master Item</h3>
                                    <p className="text-gray-400 font-bold text-xs uppercase tracking-widest mt-1">Add to permanent database</p>
                                </div>
                                <button onClick={() => setShowAddItemModal(false)} className="text-gray-400 hover:text-white transition-colors">
                                    <X className="h-8 w-8" />
                                </button>
                            </div>
                            <form onSubmit={handleCreateItemSubmit} className="p-8">
                                <div className="grid grid-cols-2 gap-6 mb-8">
                                    <div className="col-span-2">
                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Full Item Name *</label>
                                        <input
                                            required
                                            value={newItem.itemName}
                                            onChange={e => setNewItem({ ...newItem, itemName: e.target.value })}
                                            className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl font-bold text-xl focus:border-blue-500 focus:bg-white outline-none transition-all"
                                            placeholder="e.g. Fluted Jointer Premium"
                                            autoFocus
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Barcode / Code</label>
                                        <input
                                            value={newItem.barcode}
                                            onChange={e => setNewItem({ ...newItem, barcode: e.target.value })}
                                            className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl font-bold focus:border-blue-500 focus:bg-white outline-none transition-all"
                                            placeholder="Scan or Type"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Short/Alias</label>
                                        <input
                                            value={newItem.short}
                                            onChange={e => setNewItem({ ...newItem, short: e.target.value })}
                                            className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl font-bold focus:border-blue-500 focus:bg-white outline-none transition-all"
                                            placeholder="e.g. FJ1"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Sub-Category</label>
                                        <select
                                            value={newItem.subGroup}
                                            onChange={e => setNewItem({ ...newItem, subGroup: e.target.value })}
                                            className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl font-bold appearance-none bg-no-repeat bg-[right_1rem_center] cursor-pointer focus:border-blue-500 focus:bg-white outline-none transition-all"
                                        >
                                            <option value="">None / Other</option>
                                            {subGroups.map(sg => (
                                                <option key={sg._id} value={sg.subGroupName}>{sg.subGroupName}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Primary Group *</label>
                                        <select
                                            required
                                            value={newItem.group}
                                            onChange={e => setNewItem({ ...newItem, group: e.target.value })}
                                            className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl font-bold appearance-none bg-[right_1rem_center] cursor-pointer focus:border-blue-500 focus:bg-white outline-none transition-all"
                                        >
                                            <option value="">Select Group</option>
                                            {groups.map(g => (
                                                <option key={g._id} value={g.groupName}>{g.groupName}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="flex gap-4 pt-4">
                                    <button type="button" onClick={() => setShowAddItemModal(false)} className="flex-1 px-8 py-4 bg-gray-100 text-gray-600 rounded-2xl font-black uppercase tracking-widest hover:bg-gray-200 transition-all">Cancel</button>
                                    <button type="submit" className="flex-[2] px-8 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 shadow-xl shadow-blue-200 transition-all">Create Item</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
        </Layout >
    );
};

export default BillerDashboard;
