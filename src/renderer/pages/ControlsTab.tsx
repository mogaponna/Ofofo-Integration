import { useState, useEffect, useMemo } from 'react';
import { Search, Shield, ChevronRight, Loader2, X } from 'lucide-react';
import CustomDropdown from '../components/CustomDropdown';
import MultiSelectDropdown from '../components/MultiSelectDropdown';

interface Control {
  id: string;
  control_id?: string;
  control_data?: any;
  implementation_status?: string;
  dataroom_id?: string;
  organization_id?: string;
  // Static data fields (from controls.json)
  control?: string;
  domain?: string;
  grouping?: string;
  weightage?: string;
  details?: string;
  question?: string;
  evidence?: string;
  compliances?: string[];
}

interface ControlsTabProps {
  user?: { email: string; token: string } | null;
  onControlClick: (control: Control) => void;
}

// Cache for controls data
let controlsCache: { data: Control[]; timestamp: number } | null = null;
let staticControlsCache: Control[] | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export default function ControlsTab({ user, onControlClick }: ControlsTabProps) {
  const [controls, setControls] = useState<Control[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedCompliances, setSelectedCompliances] = useState<string[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string>('all');

  // Load static controls.json as reference
  const loadStaticControls = async (): Promise<Control[]> => {
    if (staticControlsCache) {
      return staticControlsCache;
    }

    try {
      const response = await fetch('/data/controls.json');
      const staticData = await response.json();
      staticControlsCache = staticData;
      return staticData;
    } catch (error) {
      console.error('Failed to load static controls:', error);
      return [];
    }
  };

  // Load controls with caching and merge with static data
  useEffect(() => {
    loadControls();
  }, [user]);

  const loadControls = async () => {
    if (!user?.token) return;

    // Check cache first
    if (controlsCache && Date.now() - controlsCache.timestamp < CACHE_DURATION) {
      setControls(controlsCache.data);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Load both static and dynamic data in parallel
      const [dbResult, staticControls] = await Promise.all([
        window.electron.db.getControls({ userId: user.token }),
        loadStaticControls(),
      ]);

      const dbControls = dbResult.success ? dbResult.controls || [] : [];
      
      // Create a map of static controls by ID for quick lookup
      const staticControlsMap = new Map<string, Control>();
      staticControls.forEach((control: Control) => {
        staticControlsMap.set(control.id, control);
      });

      // Merge DB controls with static data
      const mergedControls: Control[] = dbControls.map((dbControl: any) => {
        // Try to get control_id from control_data or use id
        const controlId = dbControl.control_id || 
                         dbControl.control_data?.id || 
                         dbControl.id;
        
        // Get static data for this control
        const staticControl = staticControlsMap.get(controlId);
        
        // Parse control_data if it's a string
        let controlData = dbControl.control_data;
        if (typeof controlData === 'string') {
          try {
            controlData = JSON.parse(controlData);
          } catch (e) {
            console.warn('Failed to parse control_data:', e);
            controlData = {};
          }
        }

        // Merge: DB data takes precedence, but fill in missing fields from static data
        return {
          id: dbControl.id,
          control_id: controlId,
          implementation_status: dbControl.implementation_status,
          dataroom_id: dbControl.dataroom_id,
          organization_id: dbControl.organization_id,
          // Use control_data if available, otherwise use static data
          control: controlData?.control || staticControl?.control || controlId,
          domain: controlData?.domain || staticControl?.domain || 'Unknown Domain',
          grouping: controlData?.grouping || staticControl?.grouping || 'Unknown',
          weightage: controlData?.weightage || staticControl?.weightage || '-',
          details: controlData?.details || staticControl?.details || '',
          question: controlData?.question || staticControl?.question || '',
          evidence: controlData?.evidence || staticControl?.evidence || '',
          compliances: controlData?.compliances || staticControl?.compliances || [],
          // Keep original control_data for reference
          control_data: controlData || staticControl || {},
        };
      });

      // If no DB controls, use static controls as fallback
      if (mergedControls.length === 0 && staticControls.length > 0) {
        const fallbackControls: Control[] = staticControls.map((staticControl: Control) => ({
          id: staticControl.id,
          control_id: staticControl.id,
          control: staticControl.control,
          domain: staticControl.domain || 'Unknown Domain',
          grouping: staticControl.grouping || 'Unknown',
          weightage: staticControl.weightage || '-',
          details: staticControl.details || '',
          question: staticControl.question || '',
          evidence: staticControl.evidence || '',
          compliances: staticControl.compliances || [],
          implementation_status: 'NOT_ASSESSED',
          control_data: staticControl,
        }));

        setControls(fallbackControls);
        controlsCache = { data: fallbackControls, timestamp: Date.now() };
      } else {
        setControls(mergedControls);
        controlsCache = { data: mergedControls, timestamp: Date.now() };
      }
    } catch (error) {
      console.error('Failed to load controls:', error);
      // Fallback to static controls on error
      try {
        const staticControls = await loadStaticControls();
        const fallbackControls: Control[] = staticControls.map((staticControl: Control) => ({
          id: staticControl.id,
          control_id: staticControl.id,
          control: staticControl.control,
          domain: staticControl.domain || 'Unknown Domain',
          grouping: staticControl.grouping || 'Unknown',
          weightage: staticControl.weightage || '-',
          details: staticControl.details || '',
          question: staticControl.question || '',
          evidence: staticControl.evidence || '',
          compliances: staticControl.compliances || [],
          implementation_status: 'NOT_ASSESSED',
          control_data: staticControl,
        }));
        setControls(fallbackControls);
      } catch (fallbackError) {
        console.error('Failed to load fallback controls:', fallbackError);
      }
    } finally {
      setLoading(false);
    }
  };

  // Extract unique values for filters
  const { domains, compliances } = useMemo(() => {
    const domainSet = new Set<string>();
    const complianceSet = new Set<string>();

    controls.forEach((control) => {
      const domain = control.domain || control.control_data?.domain;
      if (domain && domain !== 'Unknown Domain') domainSet.add(domain);

      const controlCompliances = control.compliances || control.control_data?.compliances;
      if (Array.isArray(controlCompliances)) {
        controlCompliances.forEach((comp: string) => complianceSet.add(comp));
      }
    });

    return {
      domains: Array.from(domainSet).sort(),
      compliances: Array.from(complianceSet).sort(),
    };
  }, [controls]);

  const getControlDisplayName = (control: Control): string => {
    return control.control || control.control_data?.control || control.control_id || `Control ${control.id}`;
  };

  const getControlDomain = (control: Control): string => {
    return control.domain || control.control_data?.domain || 'Unknown Domain';
  };

  const getControlGrouping = (control: Control): string => {
    return control.grouping || control.control_data?.grouping || 'Unknown';
  };

  const getControlWeightage = (control: Control): string => {
    return control.weightage || control.control_data?.weightage || '-';
  };

  const getStatusBadge = (status?: string) => {
    const statusMap: Record<string, { label: string; color: string }> = {
      IMPLEMENTED: { label: 'Implemented', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
      PARTIALLY_IMPLEMENTED: { label: 'In Progress', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
      NOT_IMPLEMENTED: { label: 'Not Started', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
      NOT_APPLICABLE: { label: 'N/A', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
      NOT_ASSESSED: { label: 'Not Assessed', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
    };

    const statusInfo = statusMap[status || 'NOT_ASSESSED'] || statusMap.NOT_ASSESSED;
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium border ${statusInfo.color}`}>
        {statusInfo.label}
      </span>
    );
  };

  const filteredControls = useMemo(() => {
    const filtered = controls.filter((control) => {
      // Search filter - Control ID has first preference
      const searchLower = searchQuery.toLowerCase();
      let matchesSearch = false;
      
      if (searchQuery) {
        const controlId = (control.control_id || '').toLowerCase();
        const controlName = getControlDisplayName(control).toLowerCase();
        const domain = getControlDomain(control).toLowerCase();
        const grouping = getControlGrouping(control).toLowerCase();
        
        // First preference: Control ID (exact match or starts with)
        if (controlId.includes(searchLower) || controlId.startsWith(searchLower)) {
          matchesSearch = true;
        } else {
          // Fallback to other fields
          matchesSearch =
            controlName.includes(searchLower) ||
            domain.includes(searchLower) ||
            grouping.includes(searchLower);
        }
      } else {
        matchesSearch = true;
      }

      // Status filter
      const matchesStatus =
        filterStatus === 'all' ||
        (filterStatus === 'implemented' && control.implementation_status === 'IMPLEMENTED') ||
        (filterStatus === 'in-progress' && control.implementation_status === 'PARTIALLY_IMPLEMENTED') ||
        (filterStatus === 'not-started' && control.implementation_status === 'NOT_IMPLEMENTED') ||
        (filterStatus === 'not-assessed' && (!control.implementation_status || control.implementation_status === 'NOT_ASSESSED'));

      // Domain filter
      const matchesDomain =
        selectedDomain === 'all' ||
        getControlDomain(control) === selectedDomain;

      // Compliance filter
      const controlCompliances = control.compliances || control.control_data?.compliances || [];
      const matchesCompliance =
        selectedCompliances.length === 0 ||
        (Array.isArray(controlCompliances) &&
          controlCompliances.some((comp: string) => selectedCompliances.includes(comp)));

      return matchesSearch && matchesStatus && matchesDomain && matchesCompliance;
    });

    // Sort: Implemented first, then In Progress, then Not Started, then Not Assessed
    const statusOrder: Record<string, number> = {
      'IMPLEMENTED': 1,
      'PARTIALLY_IMPLEMENTED': 2,
      'NOT_IMPLEMENTED': 3,
      'NOT_ASSESSED': 4,
    };

    return filtered.sort((a, b) => {
      const statusA = statusOrder[a.implementation_status || 'NOT_ASSESSED'] || 5;
      const statusB = statusOrder[b.implementation_status || 'NOT_ASSESSED'] || 5;
      if (statusA !== statusB) {
        return statusA - statusB;
      }
      // If same status, sort alphabetically by control name
      return getControlDisplayName(a).localeCompare(getControlDisplayName(b));
    });
  }, [controls, searchQuery, filterStatus, selectedDomain, selectedCompliances]);

  const clearFilters = () => {
    setSearchQuery('');
    setFilterStatus('all');
    setSelectedDomain('all');
    setSelectedCompliances([]);
  };

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (searchQuery) count++;
    if (filterStatus !== 'all') count++;
    if (selectedDomain !== 'all') count++;
    if (selectedCompliances.length > 0) count++;
    return count;
  }, [searchQuery, filterStatus, selectedDomain, selectedCompliances.length]);

  return (
    <div className="p-8 lg:p-12">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-white mb-2">Compliance Controls</h2>
          <p className="text-gray-400 mb-4">View and manage your compliance controls. Click on any control to see details and AI analysis.</p>
          
          {/* Search and Filters Row */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            {/* Search Bar - Average Width */}
            <div className="relative flex-1 sm:flex-initial sm:w-80">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search controls..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 bg-[#1a1a1a] border border-[#333333] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 text-gray-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Compact Filters */}
            <div className="flex flex-wrap gap-2">
              {/* Status Filter - Custom Dropdown */}
              <CustomDropdown
                options={[
                  { value: 'all', label: 'All Status' },
                  { value: 'implemented', label: 'Implemented' },
                  { value: 'in-progress', label: 'In Progress' },
                  { value: 'not-started', label: 'Not Started' },
                  { value: 'not-assessed', label: 'Not Assessed' }
                ]}
                value={filterStatus === 'all' ? 'all' : filterStatus}
                onChange={(val) => setFilterStatus(val)}
                placeholder="All Status"
                searchPlaceholder="Search status..."
              />

              {/* Domain Filter - Custom Dropdown with Search */}
              <CustomDropdown
                options={[
                  { value: 'all', label: 'All Domains' },
                  ...domains.map(domain => ({ value: domain, label: domain }))
                ]}
                value={selectedDomain}
                onChange={setSelectedDomain}
                placeholder="All Domains"
                searchPlaceholder="Search domains..."
              />

              {/* Compliance Filter - Multi-Select Dropdown */}
              <MultiSelectDropdown
                options={compliances}
                selected={selectedCompliances}
                onChange={setSelectedCompliances}
                placeholder="All Compliance"
                searchable
              />

              {/* Clear All */}
              {activeFiltersCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="px-3 py-2.5 text-gray-400 hover:text-white text-sm transition-colors"
                >
                  Clear All
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Active Filters */}
        {activeFiltersCount > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {searchQuery && (
              <span className="px-3 py-1 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-full text-xs flex items-center gap-2">
                Search: {searchQuery}
                <button onClick={() => setSearchQuery('')} className="hover:text-blue-300">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filterStatus !== 'all' && (
              <span className="px-3 py-1 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-full text-xs flex items-center gap-2">
                Status: {filterStatus}
                <button onClick={() => setFilterStatus('all')} className="hover:text-blue-300">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {selectedDomain !== 'all' && (
              <span className="px-3 py-1 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-full text-xs flex items-center gap-2">
                Domain: {selectedDomain}
                <button onClick={() => setSelectedDomain('all')} className="hover:text-blue-300">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {selectedCompliances.map((comp) => (
              <span
                key={comp}
                className="px-3 py-1 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-full text-xs flex items-center gap-2"
              >
                {comp}
                <button onClick={() => setSelectedCompliances(selectedCompliances.filter(c => c !== comp))} className="hover:text-blue-300">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Controls List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-blue-400 animate-spin mr-2" />
            <span className="text-gray-400">Loading controls...</span>
          </div>
        ) : filteredControls.length === 0 ? (
          <div className="text-center py-12">
            <Shield className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">No controls found</p>
            {activeFiltersCount > 0 && (
              <button
                onClick={clearFilters}
                className="mt-2 text-sm text-blue-400 hover:text-blue-300"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {filteredControls.map((control) => {
                const controlCompliances = control.compliances || control.control_data?.compliances || [];
                return (
                  <div
                    key={control.id}
                    onClick={() => onControlClick(control)}
                    className="bg-[#1a1a1a] border border-[#333333] rounded-lg p-5 hover:border-blue-500/50 cursor-pointer transition-all group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-3 mb-3">
                          <Shield className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-2 flex-wrap">
                              <h3 className="text-base font-semibold text-white group-hover:text-blue-400 transition-colors">
                                {getControlDisplayName(control)}
                              </h3>
                              {getStatusBadge(control.implementation_status)}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-400">
                              <span className="truncate">{getControlDomain(control)}</span>
                              {control.control_id && (
                                <>
                                  <span className="text-gray-600">•</span>
                                  <span className="font-mono text-xs">{control.control_id}</span>
                                </>
                              )}
                              <span className="text-gray-600">•</span>
                              <span>{getControlGrouping(control)}</span>
                              <span className="text-gray-600">•</span>
                              <span>Weight: {getControlWeightage(control)}</span>
                              {controlCompliances.length > 0 && (
                                <>
                                  <span className="text-gray-600">•</span>
                                  <span className="text-blue-400">
                                    {controlCompliances.length} compliance{controlCompliances.length > 1 ? 's' : ''}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-400 transition-colors flex-shrink-0 mt-1" />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 text-sm text-gray-400 text-center">
              Showing {filteredControls.length} of {controls.length} controls
            </div>
          </>
        )}
      </div>
    </div>
  );
}
