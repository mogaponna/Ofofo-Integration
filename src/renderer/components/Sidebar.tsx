import { LayoutDashboard, Wrench, Shield } from 'lucide-react';
import { useState } from 'react';

export type Tab = 'overview' | 'tools' | 'controls';

interface SidebarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const [isHovered, setIsHovered] = useState(false);

  const tabs = [
    { id: 'overview' as Tab, label: 'Overview', icon: LayoutDashboard },
    { id: 'tools' as Tab, label: 'Tools', icon: Wrench },
    { id: 'controls' as Tab, label: 'Controls', icon: Shield },
  ];

  return (
    <aside
      className={`
        fixed left-0 top-0 h-full bg-[#0a0a0a] border-r border-[#1a1a1a] z-50
        transition-all duration-300 ease-in-out
        ${isHovered ? 'w-56' : 'w-20'}
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex flex-col h-full pt-12 pb-6">
        {/* Logo Section - Positioned below window controls */}
        <div className="px-4 mb-6">
          <div className={`flex items-center ${isHovered ? 'justify-start gap-3' : 'justify-center'}`}>
            <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
              <img 
                src="/assets/logo.png" 
                alt="Ofofo" 
                className="w-10 h-10 object-contain"
                style={{ filter: 'brightness(0) invert(1)' }}
              />
            </div>
            {isHovered && (
              <div className="flex flex-col min-w-0">
                <h2 className="text-sm font-semibold text-white truncate">Ofofo</h2>
                <p className="text-xs text-gray-400 truncate">Integration Agent</p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`
                  w-full flex items-center gap-3 px-3 py-3 rounded-lg
                  transition-all duration-200 ease-in-out
                  group relative
                  ${
                    isActive
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                      : 'text-gray-400 hover:text-white hover:bg-[#1a1a1a]'
                  }
                `}
                title={tab.label}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-blue-400' : 'text-gray-400 group-hover:text-white'}`} />
                {isHovered && (
                  <span
                    className={`
                      text-sm font-medium whitespace-nowrap
                      transition-opacity duration-200
                      ${isActive ? 'text-blue-400' : 'text-gray-400 group-hover:text-white'}
                    `}
                  >
                    {tab.label}
                  </span>
                )}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-r-full" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Section - Optional for future items */}
        {isHovered && (
          <div className="px-4 pt-4 border-t border-[#1a1a1a]">
            <div className="text-xs text-gray-500">
              v1.0.0
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

