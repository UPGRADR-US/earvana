import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import * as Icons from "lucide-react";

import { TRACKS } from "./sounds";
import { useAudioEngine } from "./hooks/useAudioEngine";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";

const queryClient = new QueryClient();

function Home() {
  const engine = useAudioEngine();

  // Dark mode always
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center p-6 relative overflow-hidden bg-background">
      {/* Background ambient gradient */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-30 mix-blend-screen bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/20 via-background to-background"></div>
      
      <div className="z-10 w-full max-w-4xl space-y-12">
        <header className="text-center space-y-3">
          <h1 className="text-4xl md:text-5xl font-light tracking-wide text-foreground/90">Nature Sounds</h1>
          <p className="text-muted-foreground text-lg tracking-wide font-light">A quiet place to focus and relax.</p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {TRACKS.map(track => {
            const state = engine.tracks[track.id];
            const Icon = (Icons as any)[track.icon] || Icons.Circle;

            return (
              <div 
                key={track.id}
                className={`relative group rounded-2xl border p-5 transition-all duration-500 flex flex-col gap-4 overflow-hidden
                  ${state?.isPlaying 
                    ? 'border-primary/40 bg-accent/30 shadow-[0_0_30px_-5px_rgba(var(--primary),0.1)]' 
                    : 'border-border/40 bg-card hover:bg-accent/10 hover:border-border'}
                `}
              >
                {/* Active glow */}
                <div className={`absolute inset-0 bg-primary/5 transition-opacity duration-1000 pointer-events-none ${state?.isPlaying ? 'opacity-100' : 'opacity-0'}`} />

                <div className="flex items-center justify-between z-10">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl transition-colors duration-500 ${state?.isPlaying ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      <Icon className="w-5 h-5" strokeWidth={1.5} />
                    </div>
                    <span className={`font-medium tracking-wide transition-colors duration-500 ${state?.isPlaying ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {track.name}
                    </span>
                  </div>

                  <button
                    onClick={() => state?.isPlaying ? engine.pause(track.id) : engine.play(track.id)}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300
                      ${state?.isPlaying ? 'bg-primary/20 hover:bg-primary/30 text-primary' : 'bg-transparent hover:bg-accent text-muted-foreground hover:text-foreground'}
                    `}
                  >
                    {state?.isLoading ? (
                      <Icons.Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.5} />
                    ) : state?.hasError ? (
                      <Icons.AlertTriangle className="w-5 h-5 text-destructive" strokeWidth={1.5} />
                    ) : state?.isPlaying ? (
                      <Icons.Pause className="w-5 h-5" strokeWidth={1.5} />
                    ) : (
                      <Icons.Play className="w-5 h-5 ml-1" strokeWidth={1.5} />
                    )}
                  </button>
                </div>

                <div className={`transition-all duration-500 z-10 ${state?.isPlaying ? 'opacity-100 translate-y-0' : 'opacity-50 translate-y-1'}`}>
                  <Slider 
                    value={[state?.volume * 100 || 0]} 
                    max={100} 
                    step={1}
                    onValueChange={(vals) => engine.setVolume(track.id, vals[0] / 100)}
                    disabled={!state?.isPlaying}
                    className={state?.isPlaying ? "" : "opacity-50 grayscale cursor-not-allowed"}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-8 border-t border-border/30">
          <div className="flex items-center gap-4 w-full sm:w-1/3">
            <Icons.Volume2 className="w-5 h-5 text-muted-foreground" strokeWidth={1.5} />
            <Slider 
              value={[engine.masterVolume * 100]} 
              max={100} 
              step={1}
              onValueChange={(vals) => engine.setMasterVolume(vals[0] / 100)}
            />
          </div>

          <Button 
            variant="outline" 
            size="lg" 
            onClick={engine.stopAll}
            className="rounded-xl border-border/40 hover:bg-accent/50 transition-all font-light tracking-wide w-full sm:w-auto"
          >
            Stop All
          </Button>
        </div>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;