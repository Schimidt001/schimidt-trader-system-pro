import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Link, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { BrokerProvider, useBroker } from "./contexts/BrokerContext";
import { BrokerSwitch, BrokerSwitchCompact } from "./components/BrokerSwitch";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import SettingsMultiBroker from "./pages/SettingsMultiBroker";
import Logs from "./pages/Logs";
import MarketCalendar from "./pages/MarketCalendar";
import AdminUsers from "./pages/AdminUsers";
import Backtest from "./pages/Backtest";
import BacktestLab from "./pages/BacktestLab";
import { useAuth } from "./_core/hooks/useAuth";
import { getLoginUrl } from "./const";
import { CinematicLogin } from "./components/CinematicLogin";
import LocalLogin from "./pages/LocalLogin";
import FuturisticLogin from "./pages/FuturisticLogin";
import { Button } from "./components/ui/button";
import { BarChart3, Settings as SettingsIcon, FileText, LogOut, Calendar, Users, FlaskConical } from "lucide-react";
import { trpc } from "./lib/trpc";

/**
 * Navegação Principal
 * 
 * IMPORTANTE: O sistema usa "Contextos Isolados" através do Global Broker Switch.
 * NÃO há abas separadas para Deriv/Forex - o switch no header alterna o contexto
 * de toda a aplicação, e cada página renderiza conteúdo apropriado ao contexto.
 */
function Navigation() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { isDeriv, isICMarkets, currentConfig } = useBroker();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      window.location.href = "/";
    },
  });

  const oauthConfigured = import.meta.env.VITE_OAUTH_PORTAL_URL && import.meta.env.VITE_APP_ID;
  
  // Só esconder navegação se OAuth está configurado E não tem usuário
  if (!user && oauthConfigured) return null;

  // Menu de navegação - SEM aba separada de Forex
  // O contexto é controlado pelo Global Broker Switch no header
  const navItems = [
    { path: "/", label: "Dashboard", icon: BarChart3 },
    { path: "/market", label: "Mercado", icon: Calendar },
    { path: "/settings", label: "Configurações", icon: SettingsIcon },
    { path: "/logs", label: "Logs", icon: FileText },
    { path: "/backtest", label: "Backtest", icon: FlaskConical },
    { path: "/backtest-lab", label: "Lab", icon: FlaskConical },
  ];
  
  // Adicionar item de admin se usuário for admin
  if (user?.role === 'admin') {
    navItems.push({ path: "/admin/users", label: "Usuários", icon: Users });
  }

  return (
    <nav className="bg-slate-900/80 border-b border-slate-800 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Logo e Navegação */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-white">Schimidt Trader PRO</h2>
              {/* Indicador do modo atual (mobile) */}
              <div className="sm:hidden">
                <BrokerSwitchCompact />
              </div>
            </div>
            <div className="hidden md:flex gap-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.path;
                return (
                  <Link key={item.path} href={item.path}>
                    <Button
                      variant={isActive ? "default" : "ghost"}
                      className={`gap-2 ${
                        isActive
                          ? "bg-slate-800 text-white"
                          : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </Button>
                  </Link>
                );
              })}
            </div>
          </div>
          
          {/* Global Broker Switch + User Info */}
          <div className="flex items-center gap-4">
            {/* Global Broker Switch - Visível apenas em desktop */}
            <div className="hidden sm:block">
              <BrokerSwitch />
            </div>
            
            {user && (
              <span className="hidden lg:inline text-sm text-slate-400">
                {user.name || user.email}
              </span>
            )}
            {oauthConfigured && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => logoutMutation.mutate()}
                className="gap-2 text-slate-400 hover:text-white"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sair</span>
              </Button>
            )}
          </div>
        </div>
        
        {/* Navegação mobile */}
        <div className="md:hidden flex gap-1 mt-3 overflow-x-auto pb-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path;
            return (
              <Link key={item.path} href={item.path}>
                <Button
                  variant={isActive ? "default" : "ghost"}
                  size="sm"
                  className={`gap-1.5 whitespace-nowrap ${
                    isActive
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </Button>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

/**
 * Router Principal
 * 
 * O Dashboard renderiza conteúdo diferente baseado no broker selecionado
 * através do Global Broker Switch (BrokerContext).
 * 
 * - Modo DERIV: Dashboard mostra operações Binary/Synthetics
 * - Modo IC MARKETS: Dashboard mostra operações Forex Spot
 */
function Router() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-white">Carregando...</div>
      </div>
    );
  }

  // Se não tem usuário, mostrar tela de login
  const oauthConfigured = import.meta.env.VITE_OAUTH_PORTAL_URL && import.meta.env.VITE_APP_ID;
  
  if (!user) {
    // Se OAuth está configurado, usar CinematicLogin
    if (oauthConfigured) {
      return <CinematicLogin />;
    }
    // Senão, usar FuturisticLogin
    return <FuturisticLogin />;
  }

  return (
    <>
      <Navigation />
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/market" component={MarketCalendar} />
        <Route path="/settings" component={SettingsMultiBroker} />
        <Route path="/settings-legacy" component={Settings} />
        <Route path="/logs" component={Logs} />
        <Route path="/admin/users" component={AdminUsers} />
        <Route path="/backtest" component={Backtest} />
        <Route path="/backtest-lab" component={BacktestLab} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <BrokerProvider defaultBroker="DERIV">
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </BrokerProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
