/**
 * Azure Powerpipe Mods Configuration
 * 
 * Reference: https://hub.steampipe.io/plugins/turbot/azure/mods
 */

const AZURE_MODS = [
  {
    id: 'azure-compliance',
    name: 'Azure Compliance',
    description: 'Run individual configuration, compliance and security controls or full compliance benchmarks for CIS, HIPAA HITRUST, NIST, PCI DSS',
    repo: 'github.com/turbot/steampipe-mod-azure-compliance',
    version: 'v2.3.1',
    icon: 'shield-check',
    color: 'blue',
    stats: {
      dashboards: 16,
      benchmarks: 1654,
      queries: 489,
      variables: 8
    },
    frameworks: ['CIS', 'NIST', 'PCI DSS', 'HIPAA HITRUST', 'SOC 2'],
    benchmarks: [
      { id: 'cis_v200', name: 'CIS v2.0.0', controls: 237 },
      { id: 'cis_v210', name: 'CIS v2.1.0', controls: 243 },
      { id: 'nist_sp_800_53_rev_5', name: 'NIST SP 800-53 Rev 5', controls: 389 },
      { id: 'nist_sp_800_171_rev_2', name: 'NIST SP 800-171 Rev 2', controls: 183 },
      { id: 'pci_dss_v321', name: 'PCI DSS v3.2.1', controls: 219 },
      { id: 'pci_dss_v4', name: 'PCI DSS v4', controls: 224 },
      { id: 'hipaa_hitrust_v92', name: 'HIPAA HITRUST v9.2', controls: 276 },
      { id: 'soc_2', name: 'SOC 2', controls: 167 }
    ],
    hubUrl: 'https://hub.powerpipe.io/mods/turbot/steampipe-mod-azure-compliance'
  },
  {
    id: 'azure-insights',
    name: 'Azure Insights',
    description: 'Create dashboards and reports for your Azure resources',
    repo: 'github.com/turbot/steampipe-mod-azure-insights',
    version: 'v1.1.0',
    icon: 'bar-chart',
    color: 'purple',
    stats: {
      dashboards: 72,
      reports: 150,
      queries: 280
    },
    categories: ['Cost', 'Performance', 'Security', 'Inventory', 'Networking'],
    hubUrl: 'https://hub.powerpipe.io/mods/turbot/steampipe-mod-azure-insights'
  },
  {
    id: 'azure-perimeter',
    name: 'Azure Perimeter',
    description: 'Run security controls to look for resources that are publicly accessible and have insecure network configurations',
    repo: 'github.com/turbot/steampipe-mod-azure-perimeter',
    version: 'v1.0.0',
    icon: 'globe',
    color: 'orange',
    stats: {
      controls: 85,
      queries: 120
    },
    categories: ['Public Access', 'Network Security', 'Firewall Rules', 'Exposure'],
    hubUrl: 'https://hub.powerpipe.io/mods/turbot/steampipe-mod-azure-perimeter'
  },
  {
    id: 'azure-tags',
    name: 'Azure Tags',
    description: 'Run tagging controls across all your Azure subscriptions',
    repo: 'github.com/turbot/steampipe-mod-azure-tags',
    version: 'v1.1.0',
    icon: 'tag',
    color: 'green',
    stats: {
      controls: 42,
      queries: 68
    },
    categories: ['Tag Compliance', 'Resource Tagging', 'Cost Allocation'],
    hubUrl: 'https://hub.powerpipe.io/mods/turbot/steampipe-mod-azure-tags'
  },
  {
    id: 'azure-thrifty',
    name: 'Azure Thrifty',
    description: 'Check your Azure subscription(s) for unused and under utilized resources to optimize costs',
    repo: 'github.com/turbot/steampipe-mod-azure-thrifty',
    version: 'v1.1.0',
    icon: 'dollar-sign',
    color: 'teal',
    stats: {
      controls: 67,
      queries: 95
    },
    categories: ['Cost Optimization', 'Unused Resources', 'Right-sizing', 'Savings'],
    hubUrl: 'https://hub.powerpipe.io/mods/turbot/steampipe-mod-azure-thrifty'
  }
];

module.exports = { AZURE_MODS };

