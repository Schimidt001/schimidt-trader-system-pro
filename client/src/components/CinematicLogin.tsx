import { useEffect, useRef } from 'react';
import { getLoginUrl } from '@/const';

export function CinematicLogin() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    // Pares de trading
    const tradingPairs = [
      { symbol: 'EUR/USD', price: 1.0845, color: '#00E5FF' },
      { symbol: 'GBP/USD', price: 1.2634, color: '#D4AF37' },
      { symbol: 'BTC/USDT', price: 43250.50, color: '#00E5FF' },
      { symbol: 'ETH/USD', price: 2234.75, color: '#D4AF37' },
      { symbol: 'USD/JPY', price: 149.82, color: '#00E5FF' },
      { symbol: 'XRP/USD', price: 0.6234, color: '#D4AF37' }
    ];

    // Classe para gráfico de candlestick
    class CandlestickChart {
      x: number;
      y: number;
      width: number;
      height: number;
      speed: number;
      opacity: number;
      candles: Array<{ open: number; close: number; high: number; low: number }>;
      pair: typeof tradingPairs[0];

      constructor() {
        this.x = canvas.width + 200;
        this.y = 100 + Math.random() * (canvas.height - 300);
        this.width = 250;
        this.height = 120;
        this.speed = 0.4 + Math.random() * 0.3;
        this.opacity = 0.15 + Math.random() * 0.15;
        this.candles = this.generateRealisticCandles();
        this.pair = tradingPairs[Math.floor(Math.random() * tradingPairs.length)];
      }

      generateRealisticCandles() {
        const candles = [];
        let basePrice = 50;
        
        for (let i = 0; i < 20; i++) {
          const volatility = 5 + Math.random() * 10;
          const trend = (Math.random() - 0.5) * 3;
          
          const open = basePrice;
          const close = basePrice + trend + (Math.random() - 0.5) * volatility;
          const high = Math.max(open, close) + Math.random() * volatility * 0.5;
          const low = Math.min(open, close) - Math.random() * volatility * 0.5;
          
          candles.push({ open, close, high, low });
          basePrice = close;
        }
        
        return candles;
      }

      draw() {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        
        // Painel de fundo
        ctx.fillStyle = 'rgba(0, 20, 30, 0.3)';
        ctx.fillRect(this.x - 10, this.y - 35, this.width + 20, this.height + 50);
        
        // Símbolo e preço
        ctx.font = '11px monospace';
        ctx.fillStyle = this.pair.color;
        ctx.fillText(this.pair.symbol, this.x, this.y - 15);
        ctx.fillText(
          this.pair.price.toFixed(this.pair.symbol.includes('BTC') || this.pair.symbol.includes('ETH') ? 2 : 4), 
          this.x + 80, 
          this.y - 15
        );
        
        // Desenhar candles
        const candleWidth = this.width / this.candles.length;
        
        this.candles.forEach((candle, i) => {
          const x = this.x + i * candleWidth;
          const isGreen = candle.close > candle.open;
          
          const color = isGreen ? '#00E5FF' : '#D4AF37';
          ctx.strokeStyle = color;
          ctx.fillStyle = isGreen ? 'rgba(0, 229, 255, 0.3)' : 'rgba(212, 175, 55, 0.3)';
          ctx.lineWidth = 1;
          
          const scale = this.height / 100;
          const highY = this.y + this.height - candle.high * scale;
          const lowY = this.y + this.height - candle.low * scale;
          const openY = this.y + this.height - candle.open * scale;
          const closeY = this.y + this.height - candle.close * scale;
          
          // Linha vertical
          ctx.beginPath();
          ctx.moveTo(x + candleWidth / 2, highY);
          ctx.lineTo(x + candleWidth / 2, lowY);
          ctx.stroke();
          
          // Corpo
          const bodyHeight = Math.abs(closeY - openY);
          const bodyY = Math.min(openY, closeY);
          
          if (bodyHeight > 1) {
            ctx.fillRect(x + 2, bodyY, candleWidth - 4, bodyHeight);
            ctx.strokeRect(x + 2, bodyY, candleWidth - 4, bodyHeight);
          }
        });
        
        // Linha de tendência
        ctx.strokeStyle = this.pair.color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = this.opacity * 0.6;
        ctx.beginPath();
        
        this.candles.forEach((candle, i) => {
          const x = this.x + i * candleWidth + candleWidth / 2;
          const avgPrice = (candle.high + candle.low) / 2;
          const y = this.y + this.height - avgPrice * (this.height / 100);
          
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        
        ctx.stroke();
        ctx.restore();
      }

      update() {
        this.x -= this.speed;
        
        if (this.x + this.width < 0) {
          this.x = canvas.width + 200;
          this.y = 100 + Math.random() * (canvas.height - 300);
          this.candles = this.generateRealisticCandles();
          this.pair = tradingPairs[Math.floor(Math.random() * tradingPairs.length)];
        }
      }
    }

    // Classe para linha de preço
    class PriceLine {
      x: number;
      y: number;
      length: number;
      speed: number;
      opacity: number;
      color: string;
      points: number[];

      constructor() {
        this.x = canvas.width + 100;
        this.y = 150 + Math.random() * (canvas.height - 300);
        this.length = 200 + Math.random() * 150;
        this.speed = 0.5 + Math.random() * 0.4;
        this.opacity = 0.1 + Math.random() * 0.1;
        this.color = Math.random() > 0.5 ? '#00E5FF' : '#D4AF37';
        this.points = this.generatePricePoints();
      }

      generatePricePoints() {
        const points = [];
        let y = 0;
        
        for (let i = 0; i < 30; i++) {
          y += (Math.random() - 0.5) * 15;
          points.push(y);
        }
        
        return points;
      }

      draw() {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        
        const segmentWidth = this.length / this.points.length;
        
        this.points.forEach((point, i) => {
          const x = this.x + i * segmentWidth;
          const y = this.y + point;
          
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        
        ctx.stroke();
        ctx.restore();
      }

      update() {
        this.x -= this.speed;
        
        if (this.x + this.length < 0) {
          this.x = canvas.width + 100;
          this.y = 150 + Math.random() * (canvas.height - 300);
          this.points = this.generatePricePoints();
        }
      }
    }

    // Classe para ticker
    class PriceTicker {
      x: number;
      y: number;
      speed: number;
      opacity: number;
      pair: typeof tradingPairs[0];
      change: number;

      constructor() {
        this.x = canvas.width + 50;
        this.y = 80 + Math.random() * (canvas.height - 160);
        this.speed = 0.6 + Math.random() * 0.4;
        this.opacity = 0.2 + Math.random() * 0.15;
        this.pair = tradingPairs[Math.floor(Math.random() * tradingPairs.length)];
        this.change = (Math.random() - 0.5) * 2;
      }

      draw() {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.font = '12px monospace';
        
        const isPositive = this.change > 0;
        ctx.fillStyle = isPositive ? '#00E5FF' : '#D4AF37';
        
        const text = `${this.pair.symbol} ${this.pair.price.toFixed(2)} ${isPositive ? '▲' : '▼'} ${Math.abs(this.change).toFixed(2)}%`;
        ctx.fillText(text, this.x, this.y);
        
        ctx.restore();
      }

      update() {
        this.x -= this.speed;
        
        if (this.x < -200) {
          this.x = canvas.width + 50;
          this.y = 80 + Math.random() * (canvas.height - 160);
          this.pair = tradingPairs[Math.floor(Math.random() * tradingPairs.length)];
          this.change = (Math.random() - 0.5) * 2;
        }
      }
    }

    // Criar elementos
    const charts: CandlestickChart[] = [];
    for (let i = 0; i < 3; i++) {
      const chart = new CandlestickChart();
      chart.x = canvas.width + i * 400;
      charts.push(chart);
    }

    const priceLines: PriceLine[] = [];
    for (let i = 0; i < 5; i++) {
      const line = new PriceLine();
      line.x = canvas.width + i * 300;
      priceLines.push(line);
    }

    const tickers: PriceTicker[] = [];
    for (let i = 0; i < 4; i++) {
      const ticker = new PriceTicker();
      ticker.x = canvas.width + i * 350;
      tickers.push(ticker);
    }

    // Loop de animação
    let animationId: number;
    function animate() {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      priceLines.forEach(line => {
        line.update();
        line.draw();
      });

      charts.forEach(chart => {
        chart.update();
        chart.draw();
      });

      tickers.forEach(ticker => {
        ticker.update();
        ticker.draw();
      });

      animationId = requestAnimationFrame(animate);
    }

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <div className="min-h-screen bg-black overflow-hidden flex items-center justify-center relative">
      {/* Canvas de animações */}
      <canvas ref={canvasRef} className="fixed top-0 left-0 w-full h-full z-[1]" />
      
      {/* Overlay de gradiente */}
      <div 
        className="fixed top-0 left-0 w-full h-full z-[2] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(0, 20, 40, 0.2) 0%, rgba(0, 0, 0, 0.95) 70%)'
        }}
      />

      {/* Container principal */}
      <div className="relative z-10 text-center w-full max-w-[1200px] px-10">
        {/* Logo */}
        <div className="mb-12 opacity-0 animate-[fadeInDown_1.2s_ease-out_0.3s_forwards]">
          <h1 
            className="text-5xl font-extralight tracking-[18px] text-[#FFD700] mb-5"
            style={{ textShadow: '0 0 40px rgba(255, 215, 0, 0.4)' }}
          >
            SCHIMIDT<br />TRADER SYSTEM PRO
          </h1>
          <p className="text-sm text-[rgba(184,184,184,0.8)] tracking-[6px] font-light uppercase">
            Sistema de Trading Automatizado 24/7
          </p>
        </div>

        {/* Imagem do perfil */}
        <div className="relative mx-auto w-[500px] h-[700px] my-12 opacity-0 animate-[fadeInScale_1.5s_ease-out_0.6s_forwards]">
          <img
            src="/login-profile.png"
            alt="Profile"
            className="w-full h-full object-contain object-[center_top]"
            style={{
              filter: 'drop-shadow(0 30px 80px rgba(0, 229, 255, 0.15))',
              clipPath: 'inset(0 0 80px 0)'
            }}
          />
        </div>

        {/* Botão de acesso */}
        <a
          href={getLoginUrl()}
          className="inline-block mt-8 px-[70px] py-[18px] text-[1.05rem] font-normal tracking-[4px] text-[#FFD700] bg-[rgba(0,0,0,0.5)] border-[1.5px] border-[rgba(212,175,55,0.6)] rounded-[2px] backdrop-blur-[20px] opacity-0 animate-[fadeInUp_1.2s_ease-out_1s_forwards] relative overflow-hidden transition-all duration-500 hover:bg-[rgba(212,175,55,0.1)] hover:border-[#FFD700] hover:shadow-[0_0_30px_rgba(212,175,55,0.3)] hover:-translate-y-[2px] before:content-[''] before:absolute before:top-0 before:left-[-100%] before:w-full before:h-full before:bg-gradient-to-r before:from-transparent before:via-[rgba(255,215,0,0.1)] before:to-transparent before:transition-[left_0.8s_ease] hover:before:left-[100%]"
        >
          ACESSAR PLATAFORMA
        </a>
      </div>

      <style>{`
        @keyframes fadeInDown {
          from {
            opacity: 0;
            transform: translateY(-30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fadeInScale {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
