import { Shield, FileText, Clock, Activity, AlertCircle, CheckCircle2, Upload, FileText as FileIcon } from 'lucide-react';
import { useMemo } from 'react';

interface Stats {
  totalControls: number;
  implementedControls: number;
  inProgressControls: number;
  notStartedControls: number;
  totalEvidence: number;
  coveredEvidence: number;
  partialEvidence: number;
  domains: number;
  compliances: number;
  lastSynced: Date | null;
}

interface OverviewTabProps {
  stats: Stats;
  loading: boolean;
}

export default function OverviewTab({ stats, loading }: OverviewTabProps) {
  const controlsCoverage = useMemo(() => {
    if (stats.totalControls === 0) return 0;
    return Math.round((stats.implementedControls / stats.totalControls) * 100);
  }, [stats.totalControls, stats.implementedControls]);

  const evidenceAvailability = useMemo(() => {
    if (stats.totalEvidence === 0) return 0;
    return Math.round((stats.coveredEvidence / stats.totalEvidence) * 100);
  }, [stats.totalEvidence, stats.coveredEvidence]);

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `about ${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `about ${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  // Generate recent activity based on stats
  const recentActivities = useMemo(() => {
    if (loading) return [];
    
    const activities = [];
    
    // Add activity for implemented controls
    if (stats.implementedControls > 0) {
      activities.push({
        id: 'controls-implemented',
        icon: CheckCircle2,
        iconColor: 'text-green-400',
        text: `${stats.implementedControls} control${stats.implementedControls > 1 ? 's' : ''} marked implemented`,
        time: stats.lastSynced ? formatTimeAgo(stats.lastSynced) : 'recently',
      });
    }
    
    // Add activity for evidence
    if (stats.coveredEvidence > 0) {
      activities.push({
        id: 'evidence-available',
        icon: Upload,
        iconColor: 'text-blue-400',
        text: `${stats.coveredEvidence} evidence item${stats.coveredEvidence > 1 ? 's' : ''} marked available`,
        time: stats.lastSynced ? formatTimeAgo(stats.lastSynced) : 'recently',
      });
    }
    
    // Add activity for frameworks if we have compliance data
    if (stats.compliances > 0) {
      activities.push({
        id: 'frameworks',
        icon: FileIcon,
        iconColor: 'text-blue-400',
        text: `${stats.compliances} framework${stats.compliances > 1 ? 's' : ''} with certificates`,
        time: stats.lastSynced ? formatTimeAgo(stats.lastSynced) : 'recently',
      });
    }
    
    return activities.slice(0, 5); // Limit to 5 most recent
  }, [stats, loading]);

  // Generate pending actions based on stats
  const pendingActions = useMemo(() => {
    if (loading) return [];
    
    const actions = [];
    
    // High priority: Not started controls
    if (stats.notStartedControls > 0) {
      actions.push({
        id: 'controls-not-started',
        icon: AlertCircle,
        iconColor: 'text-red-400',
        text: `${stats.notStartedControls} control${stats.notStartedControls > 1 ? 's' : ''} not started`,
        priority: 'high',
        priorityColor: 'bg-red-500/20 text-red-400 border-red-500/30',
      });
    }
    
    // High priority: Missing evidence
    const missingEvidence = stats.totalEvidence - stats.coveredEvidence - stats.partialEvidence;
    if (missingEvidence > 0) {
      actions.push({
        id: 'evidence-missing',
        icon: AlertCircle,
        iconColor: 'text-red-400',
        text: `Evidence missing for ${missingEvidence} area${missingEvidence > 1 ? 's' : ''}`,
        priority: 'high',
        priorityColor: 'bg-red-500/20 text-red-400 border-red-500/30',
      });
    }
    
    // Medium priority: In progress controls
    if (stats.inProgressControls > 0) {
      actions.push({
        id: 'controls-in-progress',
        icon: CheckCircle2,
        iconColor: 'text-yellow-400',
        text: `Validate ${stats.inProgressControls} in-progress control${stats.inProgressControls > 1 ? 's' : ''}`,
        priority: 'medium',
        priorityColor: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      });
    }
    
    return actions;
  }, [stats, loading]);

  return (
    <div className="p-8 lg:p-12">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Row - 3 Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Controls Coverage - Simple Format */}
          <div className="bg-[#1a1a1a] border border-[#333333] rounded-lg p-5 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500"></div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-400">CONTROLS COVERAGE</span>
              <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center">
                <Shield className="w-5 h-5 text-blue-400" />
              </div>
            </div>
            {loading ? (
              <div className="text-xs text-gray-500">Loading...</div>
            ) : (
              <>
                <div className="text-3xl font-bold text-white mb-3">{controlsCoverage}%</div>
                <div className="text-sm text-gray-300 mb-1">
                  {stats.implementedControls} of {stats.totalControls.toLocaleString()} controls implemented
                </div>
                <div className="text-xs text-gray-500">
                  {stats.inProgressControls} in progress • {stats.notStartedControls.toLocaleString()} not started
                </div>
              </>
            )}
          </div>

          {/* Evidence Availability - Simple Format */}
          <div className="bg-[#1a1a1a] border border-[#333333] rounded-lg p-5 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-green-500"></div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-400">EVIDENCE AVAILABILITY</span>
              <div className="w-10 h-10 rounded-full bg-green-600/20 flex items-center justify-center">
                <FileText className="w-5 h-5 text-green-400" />
              </div>
            </div>
            {loading ? (
              <div className="text-xs text-gray-500">Loading...</div>
            ) : (
              <>
                <div className="text-3xl font-bold text-white mb-3">{evidenceAvailability}%</div>
                <div className="text-sm text-gray-300 mb-1">
                  {stats.coveredEvidence} of {stats.totalEvidence} areas fully covered
                </div>
                <div className="text-xs text-gray-500">
                  0 uploads • {stats.partialEvidence} partially available
                </div>
              </>
            )}
          </div>

          {/* Last Synced */}
          <div className="bg-[#1a1a1a] border border-[#333333] rounded-lg p-5 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-orange-500"></div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-400">LAST SYNCED</span>
              <div className="w-10 h-10 rounded-full bg-orange-600/20 flex items-center justify-center">
                <Clock className="w-5 h-5 text-orange-400" />
              </div>
            </div>
            {loading || !stats.lastSynced ? (
              <div className="text-xs text-gray-500">Loading...</div>
            ) : (
              <>
                <div className="text-2xl font-bold text-white mb-2">
                  {formatTimeAgo(stats.lastSynced)}
                </div>
                <div className="text-sm text-gray-400 mb-2">
                  Compliance model refreshed automatically
                </div>
                <div className="text-xs text-gray-600">
                  {stats.lastSynced.toLocaleString()}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Bottom Row - 2 Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Recent Activity */}
          <div className="bg-[#1a1a1a] border border-[#333333] rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-blue-400" />
              <span className="text-sm font-medium text-gray-400">RECENT ACTIVITY</span>
            </div>
            {loading ? (
              <div className="text-xs text-gray-500">Loading...</div>
            ) : recentActivities.length === 0 ? (
              <div className="text-sm text-gray-400">No recent activity</div>
            ) : (
              <div className="space-y-3">
                {recentActivities.map((activity) => {
                  const Icon = activity.icon;
                  return (
                    <div key={activity.id} className="flex items-start gap-3">
                      <Icon className={`w-5 h-5 ${activity.iconColor} flex-shrink-0 mt-0.5`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white">{activity.text}</div>
                        <div className="text-xs text-gray-500 mt-1">{activity.time}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pending Actions */}
          <div className="bg-[#1a1a1a] border border-[#333333] rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-yellow-400" />
                <span className="text-sm font-medium text-gray-400">PENDING ACTIONS</span>
              </div>
              {pendingActions.length > 0 && (
                <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded text-xs font-medium">
                  {pendingActions.length} action{pendingActions.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            {loading ? (
              <div className="text-xs text-gray-500">Loading...</div>
            ) : pendingActions.length === 0 ? (
              <div className="text-sm text-gray-400">No pending actions</div>
            ) : (
              <div className="space-y-3">
                {pendingActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <div key={action.id} className="flex items-start gap-3">
                      <Icon className={`w-5 h-5 ${action.iconColor} flex-shrink-0 mt-0.5`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="text-sm text-white">{action.text}</div>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium border ${action.priorityColor}`}>
                            {action.priority}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
