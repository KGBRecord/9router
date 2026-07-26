"use client";

import { useCallback, useEffect, useState } from "react";
import PropTypes from "prop-types";
import Card from "./Card";
import Badge from "./Badge";

export default function TokenSaverStrategyCard({ providerId }) {
  const [strategy, setStrategy] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => {
        if (cancelled) return;
        const currentStrategies = data.tokenSaverStrategies || {};
        setStrategy(currentStrategies[providerId] || {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  const save = useCallback(
    async (newStrategy) => {
      setSaving(true);
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        const data = res.ok ? await res.json() : {};
        const current = data.tokenSaverStrategies || {};
        
        const updated = { ...current };
        if (Object.keys(newStrategy).length === 0) {
          delete updated[providerId];
        } else {
          updated[providerId] = newStrategy;
        }

        await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tokenSaverStrategies: updated }),
        });
        
        setStrategy(newStrategy);
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1500);
      } catch (e) {
        console.log("Save token saver strategy error:", e);
      } finally {
        setSaving(false);
      }
    },
    [providerId]
  );

  // 3-state cycle: Global (undefined) → Force OFF (false) → Force ON (true) → Global
  const handleToggle = (key) => {
    const currentVal = strategy[key];
    let newVal;
    if (currentVal === undefined) newVal = false;
    else if (currentVal === false) newVal = true;
    else newVal = undefined;

    const nextStrategy = { ...strategy };
    if (newVal === undefined) delete nextStrategy[key];
    else nextStrategy[key] = newVal;

    save(nextStrategy);
  };

  const renderState = (val) => {
    if (val === undefined) return <span className="text-text-muted">Global</span>;
    if (val === true) return <span className="text-success font-medium">Force ON</span>;
    return <span className="text-danger font-medium">Force OFF</span>;
  };

  return (
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary">
          <span className="material-symbols-outlined text-[20px]">bolt</span>
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">Token Saver Overrides</p>
          <p className="text-xs text-text-muted">Override global token saver settings for this specific provider (useful to disable Headroom for Anthropic to prevent schema errors).</p>
        </div>
        {savedFlash && <Badge variant="success" size="sm">Saved</Badge>}
      </div>

      <div className="flex flex-col gap-3 mt-4 border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">RTK (Tool Result Compressor)</p>
          </div>
          <button 
            disabled={saving}
            onClick={() => handleToggle("rtk")} 
            className="text-sm px-3 py-1.5 rounded bg-surface-2 border border-border hover:bg-surface-3 transition-colors min-w-[90px] text-center disabled:opacity-50"
          >
            {renderState(strategy.rtk)}
          </button>
        </div>
        
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Headroom (Compression Proxy)</p>
          </div>
          <button 
            disabled={saving}
            onClick={() => handleToggle("headroom")} 
            className="text-sm px-3 py-1.5 rounded bg-surface-2 border border-border hover:bg-surface-3 transition-colors min-w-[90px] text-center"
          >
            {renderState(strategy.headroom)}
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Caveman (Terse Style)</p>
          </div>
          <button 
            disabled={saving}
            onClick={() => handleToggle("caveman")} 
            className="text-sm px-3 py-1.5 rounded bg-surface-2 border border-border hover:bg-surface-3 transition-colors min-w-[90px] text-center"
          >
            {renderState(strategy.caveman)}
          </button>
        </div>
        
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Ponytail (Lazy Dev Style)</p>
          </div>
          <button 
            disabled={saving}
            onClick={() => handleToggle("ponytail")} 
            className="text-sm px-3 py-1.5 rounded bg-surface-2 border border-border hover:bg-surface-3 transition-colors min-w-[90px] text-center"
          >
            {renderState(strategy.ponytail)}
          </button>
        </div>
        
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Pxpipe (Image Optimization)</p>
          </div>
          <button 
            disabled={saving}
            onClick={() => handleToggle("pxpipe")} 
            className="text-sm px-3 py-1.5 rounded bg-surface-2 border border-border hover:bg-surface-3 transition-colors min-w-[90px] text-center"
          >
            {renderState(strategy.pxpipe)}
          </button>
        </div>
      </div>
    </Card>
  );
}

TokenSaverStrategyCard.propTypes = {
  providerId: PropTypes.string.isRequired,
};
