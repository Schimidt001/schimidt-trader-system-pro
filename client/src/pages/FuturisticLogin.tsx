import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Lock, Mail, Eye, EyeOff, TrendingUp, Activity, BarChart3, Zap } from "lucide-react";

export default function FuturisticLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const loginMutation = trpc.auth.loginLocal.useMutation({
    onSuccess: () => {
      toast.success("Login realizado com sucesso!");
      window.location.href = "/";
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao fazer login");
      setIsLoading(false);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast.error("Por favor, preencha todos os campos");
      return;
    }

    setIsLoading(true);
    loginMutation.mutate({ email, password });
  };

  // Animação de partículas
  useEffect(() => {
    const canvas = document.getElementById('particles') as HTMLCanvasElement;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
    }> = [];

    for (let i = 0; i < 100; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 2
      });
    }

    function animate() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(6, 182, 212, 0.3)';
        ctx.fill();
      });

      requestAnimationFrame(animate);
    }

    animate();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="relative min-h-screen bg-black overflow-hidden">
      {/* Canvas de partículas */}
      <canvas id="particles" className="absolute inset-0 z-0" />

      {/* Grid cyberpunk */}
      <div className="absolute inset-0 z-0" style={{
        backgroundImage: `
          linear-gradient(rgba(6, 182, 212, 0.1) 1px, transparent 1px),
          linear-gradient(90deg, rgba(6, 182, 212, 0.1) 1px, transparent 1px)
        `,
        backgroundSize: '50px 50px'
      }} />

      {/* Gradientes de fundo */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-amber-500/20 rounded-full blur-3xl animate-pulse delay-1000" />

      {/* Conteúdo principal */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          
          {/* Lado esquerdo - Imagem e branding */}
          <div className="flex flex-col items-center justify-center space-y-8">
            {/* Imagem do fundador com moldura futurista */}
            <div className="relative group">
              {/* Molduras geométricas animadas */}
              <div className="absolute -inset-4 border-2 border-cyan-500/50 rounded-lg animate-pulse" />
              <div className="absolute -inset-8 border border-amber-500/30 rounded-lg animate-pulse delay-500" />
              
              {/* Cantos decorativos */}
              <div className="absolute -top-2 -left-2 w-8 h-8 border-t-2 border-l-2 border-cyan-400" />
              <div className="absolute -top-2 -right-2 w-8 h-8 border-t-2 border-r-2 border-cyan-400" />
              <div className="absolute -bottom-2 -left-2 w-8 h-8 border-b-2 border-l-2 border-amber-400" />
              <div className="absolute -bottom-2 -right-2 w-8 h-8 border-b-2 border-r-2 border-amber-400" />

              {/* Imagem */}
              <div className="relative overflow-hidden rounded-lg">
                <img 
                  src="/assets/founder.png" 
                  alt="Founder" 
                  className="w-full max-w-md rounded-lg shadow-2xl shadow-cyan-500/50"
                />
                {/* Overlay de brilho */}
                <div className="absolute inset-0 bg-gradient-to-t from-cyan-500/20 to-transparent" />
              </div>

              {/* Efeito de scan line */}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/10 to-transparent animate-scan" />
            </div>

            {/* Texto de branding */}
            <div className="text-center space-y-4">
              <h1 className="text-5xl font-bold bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent animate-gradient">
                Schimidt Trader PRO
              </h1>
              <p className="text-2xl text-amber-400 font-light tracking-wider">
                A nova era do trading automatizado
              </p>
              <div className="flex items-center justify-center gap-6 text-cyan-400">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 animate-pulse" />
                  <span className="text-sm">IA Avançada</span>
                </div>
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 animate-pulse" />
                  <span className="text-sm">84.85% Precisão</span>
                </div>
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 animate-pulse" />
                  <span className="text-sm">Trading 24/7</span>
                </div>
              </div>
            </div>
          </div>

          {/* Lado direito - Formulário de login */}
          <div className="flex items-center justify-center">
            <div className="relative w-full max-w-md">
              {/* Painéis HUD decorativos */}
              <div className="absolute -top-20 -right-20 w-32 h-32 border border-cyan-500/30 rounded-lg backdrop-blur-sm bg-black/20 p-3 hidden xl:block animate-float">
                <div className="text-cyan-400 text-xs mb-2">MARKET STATUS</div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-white text-sm">ONLINE</span>
                </div>
                <div className="mt-2 text-xs text-gray-400">
                  <div>Uptime: 99.9%</div>
                  <div>Latency: 12ms</div>
                </div>
              </div>

              <div className="absolute -bottom-20 -left-20 w-32 h-32 border border-amber-500/30 rounded-lg backdrop-blur-sm bg-black/20 p-3 hidden xl:block animate-float delay-500">
                <div className="text-amber-400 text-xs mb-2">PERFORMANCE</div>
                <div className="text-2xl text-white font-bold">+847%</div>
                <div className="text-xs text-green-400">↑ Last 30 days</div>
              </div>

              {/* Card de login */}
              <div className="relative backdrop-blur-xl bg-gradient-to-br from-slate-900/90 to-slate-800/90 border-2 border-cyan-500/30 rounded-2xl shadow-2xl shadow-cyan-500/20 p-8">
                {/* Brilho no topo */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />

                {/* Logo */}
                <div className="text-center mb-8">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl mb-4 shadow-lg shadow-cyan-500/50">
                    <TrendingUp className="w-8 h-8 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">
                    Acesso Seguro
                  </h2>
                  <p className="text-cyan-400 text-sm">
                    Sistema de Trading Profissional
                  </p>
                </div>

                {/* Formulário */}
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Email */}
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-cyan-300 font-semibold">
                      Email
                    </Label>
                    <div className="relative group">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-cyan-500 group-focus-within:text-cyan-400 transition-colors" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="seu@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10 bg-slate-950/50 border-cyan-500/30 text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-cyan-400/20 h-12"
                        disabled={isLoading}
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  {/* Senha */}
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-cyan-300 font-semibold">
                      Senha
                    </Label>
                    <div className="relative group">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-cyan-500 group-focus-within:text-cyan-400 transition-colors" />
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 pr-10 bg-slate-950/50 border-cyan-500/30 text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-cyan-400/20 h-12"
                        disabled={isLoading}
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-cyan-500 hover:text-cyan-400 transition-colors"
                        tabIndex={-1}
                      >
                        {showPassword ? (
                          <EyeOff className="w-5 h-5" />
                        ) : (
                          <Eye className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Botão de Login */}
                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-600 hover:from-cyan-600 hover:via-blue-600 hover:to-purple-700 text-white font-bold py-6 rounded-xl transition-all duration-300 shadow-lg shadow-cyan-500/50 hover:shadow-cyan-500/75 hover:scale-105"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Autenticando...</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        <Lock className="w-5 h-5" />
                        <span>Acessar Plataforma</span>
                      </div>
                    )}
                  </Button>
                </form>

                {/* Rodapé */}
                <div className="mt-8 text-center">
                  <p className="text-slate-500 text-xs flex items-center justify-center gap-2">
                    <Lock className="w-3 h-3" />
                    Conexão criptografada de ponta a ponta
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Estilos CSS customizados */}
      <style>{`
        @keyframes scan {
          0%, 100% { transform: translateY(-100%); }
          50% { transform: translateY(100%); }
        }
        
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }

        @keyframes gradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }

        .animate-scan {
          animation: scan 3s ease-in-out infinite;
        }

        .animate-float {
          animation: float 3s ease-in-out infinite;
        }

        .delay-500 {
          animation-delay: 0.5s;
        }

        .delay-1000 {
          animation-delay: 1s;
        }

        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient 3s ease infinite;
        }
      `}</style>
    </div>
  );
}
