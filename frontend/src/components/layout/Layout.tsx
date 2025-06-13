import React, { ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  HomeIcon, 
  CubeIcon, 
  ArrowPathIcon, 
  ChartBarIcon, 
  Cog6ToothIcon,
  Bars3Icon,
  XMarkIcon
} from '@heroicons/react/24/outline';

interface LayoutProps {
  children: ReactNode;
}

interface NavItem {
  name: string;
  to: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

const navigation: NavItem[] = [
  { name: 'Dashboard', to: '/', icon: HomeIcon },
  { name: 'Containers', to: '/containers', icon: CubeIcon },
  { name: 'Proxy Rules', to: '/proxy', icon: ArrowPathIcon },
  { name: 'Metrics', to: '/metrics', icon: ChartBarIcon },
  { name: 'Settings', to: '/settings', icon: Cog6ToothIcon },
];

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Mobile sidebar */}
      <div className={`fixed inset-0 z-40 lg:hidden ${sidebarOpen ? 'block' : 'hidden'}`} role="dialog" aria-modal="true">
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75" aria-hidden="true" onClick={() => setSidebarOpen(false)}></div>
        <div className="fixed inset-y-0 left-0 flex max-w-xs w-full flex-col bg-white shadow-xl">
          <div className="h-0 flex-1 flex flex-col overflow-y-auto pt-5 pb-4">
            <div className="flex items-center flex-shrink-0 px-4">
              <h1 className="text-xl font-bold text-gray-900">Kontainers</h1>
              <button
                type="button"
                className="ml-auto h-10 w-10 inline-flex items-center justify-center rounded-md text-gray-500 hover:text-gray-900"
                onClick={() => setSidebarOpen(false)}
              >
                <span className="sr-only">Close sidebar</span>
                <XMarkIcon className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>
            <nav className="mt-5 flex-1 px-2 space-y-1">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  to={item.to}
                  className={`
                    group flex items-center px-2 py-2 text-base font-medium rounded-md
                    ${isActive(item.to)
                      ? 'bg-gray-100 text-gray-900'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
                  `}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon
                    className={`
                      mr-4 h-6 w-6
                      ${isActive(item.to) ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-500'}
                    `}
                    aria-hidden="true"
                  />
                  {item.name}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </div>

      {/* Static sidebar for desktop */}
      <div className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:border-r lg:border-gray-200 lg:bg-white">
        <div className="flex items-center h-16 flex-shrink-0 px-4 bg-white border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-900">Kontainers</h1>
        </div>
        <div className="flex-1 flex flex-col overflow-y-auto">
          <nav className="flex-1 px-2 py-4 space-y-1">
            {navigation.map((item) => (
              <Link
                key={item.name}
                to={item.to}
                className={`
                  group flex items-center px-2 py-2 text-sm font-medium rounded-md
                  ${isActive(item.to)
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
                `}
              >
                <item.icon
                  className={`
                    mr-3 h-5 w-5
                    ${isActive(item.to) ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-500'}
                  `}
                  aria-hidden="true"
                />
                {item.name}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64 flex flex-col">
        <div className="sticky top-0 z-10 flex-shrink-0 flex h-16 bg-white border-b border-gray-200 lg:hidden">
          <button
            type="button"
            className="px-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <span className="sr-only">Open sidebar</span>
            <Bars3Icon className="h-6 w-6" aria-hidden="true" />
          </button>
          <div className="flex-1 flex justify-center px-4">
            <h1 className="text-xl font-bold text-gray-900 self-center">Kontainers</h1>
          </div>
        </div>
        <main className="flex-1">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;