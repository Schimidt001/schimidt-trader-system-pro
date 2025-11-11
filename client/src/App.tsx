import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Link, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import Logs from "./pages/Logs";
import { useAuth } from "./_core/hooks/useAuth";
import { getLoginUrl } from "./const";
import { CinematicLogin } from "./components/CinematicLogin";
import { Button } from "./components/ui/button";
import { BarChart3, Settings as SettingsIcon, FileText, LogOut } from "lucide-react";
import { trpc } from "./lib/trpc";

function Navigation() {
  const [location] = useLocation();
  const { user } = useAuth();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      window.location.href = "/";
    },
  });

  const oauthConfigured = import.meta.env.VITE_OAUTH_PORTAL_URL && import.meta.env.VITE_APP_ID;
  
  // Só esconder navegação se OAuth está configurado E não tem usuário
  if (!user && oauthConfigured) return null;

  const navItems = [
    { path: "/", label: "Dashboard", icon: BarChart3 },
    { path: "/settings", label: "Configurações", icon: SettingsIcon },
    { path: "/logs", label: "Logs", icon: FileText },
  ];

  return (
    <nav className="bg-slate-900/80 border-b border-slate-800 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h2 className="text-xl font-bold text-white">Schimidt Trader PRO</h2>
            <div className="flex gap-2">
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
          <div className="flex items-center gap-4">
            {user && <span className="text-sm text-slate-400">{user.name || user.email}</span>}
            {oauthConfigured && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => logoutMutation.mutate()}
                className="gap-2 text-slate-400 hover:text-white"
              >
                <LogOut className="w-4 h-4" />
                Sair
              </Button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

function Router() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-white">Carregando...</div>
      </div>
    );
  }

  // Se não tem usuário E OAuth está configurado, mostrar tela de login
  const oauthConfigured = import.meta.env.VITE_OAUTH_PORTAL_URL && import.meta.env.VITE_APP_ID;
  
  if (!user && oauthConfigured) {
    return <CinematicLogin />;
  }
  
  // Se OAuth não está configurado, continuar sem usuário (modo mock no backend)
  if (!user && !oauthConfigured) {
    console.log('[App] OAuth não configurado, continuando sem autenticação');
  }

  return (
    <>
      <Navigation />
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/settings" component={Settings} />
        <Route path="/logs" component={Logs} />
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
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

