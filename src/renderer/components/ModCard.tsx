import { Shield, BarChart, Globe, Tag, DollarSign, ChevronRight } from 'lucide-react';

interface ModCardProps {
  mod: {
    id: string;
    name: string;
    description: string;
    icon: string;
    color: string;
  };
  onCheckBenchmarks: (modId: string) => void;
}

const iconMap: Record<string, any> = {
  'shield-check': Shield,
  'bar-chart': BarChart,
  'globe': Globe,
  'tag': Tag,
  'dollar-sign': DollarSign,
};

const colorMap: Record<string, string> = {
  blue: 'from-blue-500/20 to-blue-600/20 border-blue-500/30 hover:border-blue-500/50',
  purple: 'from-purple-500/20 to-purple-600/20 border-purple-500/30 hover:border-purple-500/50',
  orange: 'from-orange-500/20 to-orange-600/20 border-orange-500/30 hover:border-orange-500/50',
  green: 'from-green-500/20 to-green-600/20 border-green-500/30 hover:border-green-500/50',
  teal: 'from-teal-500/20 to-teal-600/20 border-teal-500/30 hover:border-teal-500/50',
};

const colorAccentMap: Record<string, string> = {
  blue: 'text-blue-400',
  purple: 'text-purple-400',
  orange: 'text-orange-400',
  green: 'text-green-400',
  teal: 'text-teal-400',
};

export default function ModCard({ mod, onCheckBenchmarks }: ModCardProps) {
  const Icon = iconMap[mod.icon] || Shield;
  const gradient = colorMap[mod.color] || colorMap.blue;
  const accentColor = colorAccentMap[mod.color] || colorAccentMap.blue;

  return (
    <div
      className={`relative bg-gradient-to-br ${gradient} border rounded-2xl p-6 transition-all duration-300 hover:shadow-xl hover:scale-[1.02] group cursor-pointer`}
      onClick={() => onCheckBenchmarks(mod.id)}
    >
      {/* Icon */}
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3 bg-black/30 rounded-xl ${accentColor}`}>
          <Icon className="w-8 h-8" />
        </div>
        <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
      </div>

      {/* Title & Description */}
      <h3 className="text-xl font-semibold text-white mb-2">{mod.name}</h3>
      <p className="text-sm text-gray-300 mb-4">{mod.description}</p>

      {/* Check Benchmarks Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onCheckBenchmarks(mod.id);
        }}
        className={`w-full py-3 rounded-xl font-medium transition-all duration-300 flex items-center justify-center gap-2 bg-gradient-to-r ${gradient} hover:shadow-lg hover:scale-105 text-white`}
      >
        Check Benchmarks
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}
