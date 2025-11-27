import { LayoutDashboard, Wrench, Shield } from 'lucide-react';

export type Tab = 'overview' | 'tools' | 'controls';

interface TabNavigationProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export default function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  const tabs = [
    { id: 'overview' as Tab, label: 'Overview', icon: LayoutDashboard },
    { id: 'tools' as Tab, label: 'Tools', icon: Wrench },
    { id: 'controls' as Tab, label: 'Controls', icon: Shield },
  ];

  return (
    <div className="border-b border-[#333333] bg-black">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <nav className="flex space-x-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`
                  flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors
                  border-b-2 ${
                    isActive
                      ? 'border-blue-500 text-white'
                      : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-600'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

