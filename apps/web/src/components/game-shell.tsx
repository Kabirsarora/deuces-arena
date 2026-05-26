"use client";

import { MonitorSmartphone, Radio } from "lucide-react";
import { useState } from "react";

import { LocalGameTable } from "@/components/local-game-table";
import { OnlineRoomPanel } from "@/components/online-room-panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type GameMode = "local" | "online";

export function GameShell() {
  const [mode, setMode] = useState<GameMode>("local");

  return (
    <div>
      <div className="hud-glass fixed left-1/2 top-3 z-50 flex -translate-x-1/2 rounded-full border border-white/10 p-1 backdrop-blur">
        <ModeButton mode="local" activeMode={mode} onSelect={setMode} />
        <ModeButton mode="online" activeMode={mode} onSelect={setMode} />
      </div>
      {mode === "local" ? <LocalGameTable /> : <OnlineRoomPanel />}
    </div>
  );
}

function ModeButton({
  mode,
  activeMode,
  onSelect
}: {
  readonly mode: GameMode;
  readonly activeMode: GameMode;
  readonly onSelect: (mode: GameMode) => void;
}) {
  const active = mode === activeMode;

  return (
    <Button
      variant={active ? "primary" : "secondary"}
      size="sm"
      className={cn("h-8 rounded-full px-3", !active && "border-transparent bg-transparent")}
      onClick={() => onSelect(mode)}
    >
      {mode === "local" ? <MonitorSmartphone className="size-4" /> : <Radio className="size-4" />}
      {mode === "local" ? "Local" : "Online"}
    </Button>
  );
}
