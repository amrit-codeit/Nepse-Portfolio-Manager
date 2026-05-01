import React from 'react';

const FreshnessTag = ({ timestamp, label = "Data" }) => {
  if (!timestamp) return null;
  
  const date = new Date(timestamp);
  const now = new Date();
  
  // Calculate difference in minutes
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  
  let freshnessColor = "text-gray-400 bg-gray-800/50 border-gray-700";
  let statusText = "Unknown";
  
  if (diffMins < 5) {
    freshnessColor = "text-emerald-400 bg-emerald-900/20 border-emerald-800/50";
    statusText = "Live";
  } else if (diffMins < 60) {
    freshnessColor = "text-blue-400 bg-blue-900/20 border-blue-800/50";
    statusText = `${diffMins}m ago`;
  } else if (diffMins < 1440) {
    const hours = Math.floor(diffMins / 60);
    freshnessColor = "text-yellow-400 bg-yellow-900/20 border-yellow-800/50";
    statusText = `${hours}h ago`;
  } else {
    const days = Math.floor(diffMins / 1440);
    freshnessColor = "text-red-400 bg-red-900/20 border-red-800/50";
    statusText = `${days}d ago`;
  }
  
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-medium border ${freshnessColor}`} title={`${label} last updated: ${date.toLocaleString()}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${diffMins < 5 ? 'bg-emerald-400 animate-pulse' : diffMins < 60 ? 'bg-blue-400' : diffMins < 1440 ? 'bg-yellow-400' : 'bg-red-400'}`}></span>
      {statusText}
    </div>
  );
};

export default FreshnessTag;
