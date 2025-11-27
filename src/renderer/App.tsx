import { useState, useEffect } from 'react';
import Home from './pages/Home';
import AzureIntegration from './pages/AzureIntegration';
import SubprocessPage from './pages/SubprocessPage';
import Login from './pages/Login';
import ControlDetail from './pages/ControlDetail';

export type Page = 'home' | 'azure' | 'aws' | 'gcp' | 'subprocess';

interface User {
  email: string;
  token: string;
}

interface Control {
  id: string;
  control_id?: string;
  control_data?: any;
  implementation_status?: string;
  dataroom_id?: string;
  organization_id?: string;
  control?: string;
  domain?: string;
  grouping?: string;
  weightage?: string;
  details?: string;
  question?: string;
  evidence?: string;
  compliances?: string[];
}

const SESSION_KEY = 'ofofo_user_session';
const SESSION_EXPIRY_KEY = 'ofofo_session_expiry';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [darkMode, setDarkMode] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedControl, setSelectedControl] = useState<Control | null>(null);
  const [selectedSubprocessId, setSelectedSubprocessId] = useState<string | null>(null);

  useEffect(() => {
    // Check for stored user session
    const loadSession = async () => {
      try {
        const storedSession = localStorage.getItem(SESSION_KEY);
        const storedExpiry = localStorage.getItem(SESSION_EXPIRY_KEY);

        if (storedSession && storedExpiry) {
          const expiryTime = parseInt(storedExpiry, 10);
          const now = Date.now();

          // Check if session is still valid (24 hours)
          if (now < expiryTime) {
            const userData = JSON.parse(storedSession);
            
            // Use stored session (validation can be added later if needed)
            setUser(userData);
          } else {
            // Session expired
            localStorage.removeItem(SESSION_KEY);
            localStorage.removeItem(SESSION_EXPIRY_KEY);
          }
        }
      } catch (e) {
        console.error('Error loading session:', e);
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(SESSION_EXPIRY_KEY);
      } finally {
        setIsLoading(false);
      }
    };

    loadSession();
  }, []);

  const handleLoginSuccess = (email: string, token: string) => {
    const userData = { email, token };
    setUser(userData);
    
    // Store session with 24 hour expiry
    const expiryTime = Date.now() + (24 * 60 * 60 * 1000);
    localStorage.setItem(SESSION_KEY, JSON.stringify(userData));
    localStorage.setItem(SESSION_EXPIRY_KEY, expiryTime.toString());
  };

  const handleLogout = () => {
    setUser(null);
    setSelectedControl(null);
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_EXPIRY_KEY);
  };

  const handleControlClick = (control: Control) => {
    setSelectedControl(control);
  };

  const handleBackFromControl = () => {
    setSelectedControl(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div>
      {currentPage === 'home' && (
        <Home 
          onSelectSubprocessor={(page: Page, subprocessId?: string) => {
            setCurrentPage(page);
            if (subprocessId) {
              setSelectedSubprocessId(subprocessId);
            }
          }}
          darkMode={darkMode}
          toggleDarkMode={() => setDarkMode(!darkMode)}
          user={user}
          onLogout={handleLogout}
        />
      )}
      {currentPage === 'azure' && (
        selectedControl ? (
          <ControlDetail
            control={selectedControl}
            onBack={handleBackFromControl}
            user={user}
          />
        ) : (
          <AzureIntegration 
            onBack={() => setCurrentPage('home')}
            darkMode={darkMode}
            toggleDarkMode={() => setDarkMode(!darkMode)}
            user={user}
            onLogout={handleLogout}
            onControlClick={handleControlClick}
          />
        )
      )}
      {currentPage === 'subprocess' && selectedSubprocessId && (
        selectedControl ? (
          <ControlDetail
            control={selectedControl}
            onBack={handleBackFromControl}
            user={user}
          />
        ) : (
          <SubprocessPage 
            subprocessId={selectedSubprocessId}
            onBack={() => {
              setCurrentPage('home');
              setSelectedSubprocessId(null);
            }}
            user={user}
          />
        )
      )}
    </div>
  );
}

export default App;
