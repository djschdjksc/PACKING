import React from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, Menu, User } from 'lucide-react';

const Layout = ({ children, title }) => {
    const { user, logout } = useAuth();

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header */}
            <header className="bg-blue-600 text-white shadow-md sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <button className="p-1 rounded-md hover:bg-blue-700 md:hidden">
                            <Menu className="h-6 w-6" />
                        </button>
                        <h1 className="text-xl font-bold truncate">{title || 'Packing App'}</h1>
                    </div>

                    <div className="flex items-center space-x-4">
                        <div className="hidden md:flex items-center space-x-2">
                            <User className="h-5 w-5 opacity-75" />
                            <span className="text-sm font-medium">{user?.name} ({user?.role})</span>
                        </div>

                        <button
                            onClick={logout}
                            className="p-2 rounded-full hover:bg-blue-700 transition-colors"
                            title="Logout"
                        >
                            <LogOut className="h-5 w-5" />
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {children}
            </main>

            {/* Mobile Bottom Bar (Optional, can be used for navigation later) */}
            {/* <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around p-3">
        ...
      </div> */}
        </div>
    );
};

export default Layout;
