declare global {
  interface Window {
    electron: {
      platform: string;
        // Shell operations
        openExternal: (url: string) => void;
        // Database operations
        db: {
          sendOTP: (data: { email: string }) => Promise<{ success: boolean; error?: string; message?: string }>;
          verifyOTP: (data: { email: string; otp: string }) => Promise<{ success: boolean; error?: string; user?: { email: string; token: string } }>;
          getControls: (data?: { userId?: string; organizationId?: string; dataroomId?: string }) => Promise<{ success: boolean; controls?: any[]; error?: string }>;
          getEvidence: (data?: { userId?: string; organizationId?: string; dataroomId?: string }) => Promise<{ success: boolean; evidence?: any[]; error?: string }>;
        };
        // Backend API calls
        uploadToAzure: (data: any) => Promise<any>;
        addToContext: (data: any) => Promise<any>;
        evaluateEvidence: (data: any) => Promise<any>;
        evaluateControls: (data: any) => Promise<any>;
        // Azure Evidence Collection
        azure: {
          checkCLI: () => Promise<{ success: boolean; cli?: any; auth?: any; error?: string }>;
          initializeAuth: () => Promise<{ success: boolean; error?: string; method?: string }>;
          getSubscriptionInfo: () => Promise<{ success: boolean; subscription?: any; subscriptions?: any[]; error?: string }>;
          getDeviceCode: () => Promise<{ success: boolean; deviceCode?: any; error?: string }>;
          confirmDeviceCode: () => Promise<{ success: boolean; error?: string }>;
          collectEvidence: (data: { controlId: string; controlName: string; controlData?: any; config?: any }) => Promise<{ success: boolean; evidence?: any; file?: any; error?: string }>;
          collectBulkEvidence: (data: { controls: any[]; config?: any }) => Promise<{ success: boolean; results?: any[]; file?: any; error?: string }>;
          getApplicableControls: (data: { controls: any[] }) => Promise<{ success: boolean; applicable?: any[]; total?: number; applicableCount?: number; error?: string }>;
          getControlMappings: (data: { controls: any[] }) => Promise<{ success: boolean; mappings?: any; error?: string }>;
          setSubscription: (subscriptionId: string) => Promise<{ success: boolean; error?: string }>;
        };
        // Powerpipe operations
        powerpipe: {
          checkInstallation: () => Promise<{ success: boolean; powerpipe?: any; steampipe?: any; error?: string }>;
          listPlugins: () => Promise<{ success: boolean; plugins?: string[]; knownPlugins?: string[]; pluginDetails?: any; note?: string; error?: string }>;
          installPlugin: (pluginName: string) => Promise<{ success: boolean; message?: string; output?: string; error?: string }>;
          configureConnection: (data: { pluginName: string; config: any }) => Promise<{ success: boolean; message?: string; configFile?: string; error?: string }>;
          testConnection: (pluginName: string) => Promise<{ success: boolean; message?: string; output?: string; error?: string }>;
          runBenchmark: (data: { pluginName: string; benchmarkName: string }) => Promise<{ success: boolean; results?: any; benchmark?: string; plugin?: string; error?: string }>;
          queryEvidence: (data: { pluginName: string; query: string }) => Promise<{ success: boolean; data?: any; plugin?: string; error?: string }>;
          mapControls: (data: { controls: any[] }) => Promise<{ success: boolean; mappings?: any; error?: string }>;
          collectEvidence: (data: { control: any; pluginName: string; config?: any }) => Promise<{ success: boolean; evidence?: any; file?: any; error?: string }>;
          getBenchmarks: (pluginName: string) => Promise<{ success: boolean; benchmarks?: string[]; error?: string }>;
          runAzureQueries: (data: { limit?: number; subscriptionId?: string }) => Promise<{ success: boolean; results?: any[]; outputPath?: string; summary?: any; error?: string }>;
          // Mod management
          installMod: (data: { modRepo: string; version?: string }) => Promise<{ success: boolean; output?: string; error?: string }>;
          checkModInstalled: (modRepo: string) => Promise<{ success: boolean; installed: boolean; error?: string }>;
          runModBenchmark: (data: { modRepo: string; benchmarkName: string; format?: string }) => Promise<{ success: boolean; results?: any; stderr?: string; error?: string }>;
          listBenchmarks: (data: { modRepo: string }) => Promise<{ success: boolean; benchmarks: any[]; error?: string }>;
          runModCompliance: (data: { modId: string; modRepo: string; benchmarkId?: string }) => Promise<{ success: boolean; markdownReport?: string; jsonResults?: any; benchmark?: string; error?: string }>;
          checkPluginInstalled: () => Promise<{ success: boolean; installed: boolean; error?: string }>;
        };
        // Subprocess management
        subprocess: {
          save: (data: { userId: string; subprocessData: any }) => Promise<{ success: boolean; subprocess?: any; error?: string }>;
          getAll: (userId: string) => Promise<{ success: boolean; subprocesses?: any[]; error?: string }>;
          getById: (id: string) => Promise<{ success: boolean; subprocess?: any; error?: string }>;
          updateStatus: (data: { id: string; status: string }) => Promise<{ success: boolean; subprocess?: any; error?: string }>;
          delete: (id: string) => Promise<{ success: boolean; error?: string }>;
          checkAzureCLI: () => Promise<{ installed: boolean; version?: string }>;
          installAzureCLI: () => Promise<{ success: boolean; error?: string }>;
          authenticateAzureCLI: () => Promise<{ success: boolean; accounts?: any[]; message?: string; error?: string }>;
          getAzureSubscriptions: () => Promise<{ success: boolean; subscriptions?: any[]; error?: string }>;
          setupAzure: (data: { subscriptionId: string; tenantId?: string }) => Promise<{ success: boolean; subscriptions?: any[]; message?: string; error?: string }>;
          configurePlugin: (subscriptionId: string) => Promise<{ success: boolean; cached?: boolean; configFile?: string; error?: string }>;
          getAzureTables: () => Promise<{ success: boolean; tables?: string[]; error?: string }>;
          querySteampipe: (data: { query: string }) => Promise<{ success: boolean; data?: any; error?: string }>;
          installAzureMod: () => Promise<{ success: boolean; error?: string }>;
          getBenchmarks: (data?: { modName?: string }) => Promise<{ success: boolean; benchmarks?: any[]; error?: string }>;
          runBenchmark: (data: { benchmarkName: string }) => Promise<{ success: boolean; results?: any; error?: string }>;
        };
        // Dataroom management
      // Dataroom management
      dataroom: {
        saveReport: (data: { fileName: string; content: string; userId: string; subprocessId: string; subprocessName?: string; modId?: string; benchmarkId?: string }) => Promise<{ success: boolean; filePath?: string; fileId?: string; error?: string }>;
      };
      // Installation status
      getInstallationStatus: () => Promise<{ success: boolean; status?: any }>;
    };
  }
}

export {};

