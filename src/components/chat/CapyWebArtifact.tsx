/**
 * CapyWebArtifact - Research results display for Capy Web
 * 
 * Shows:
 * - Research progress (live)
 * - Answers with confidence
 * - Claims with sources
 * - Execution stats
 */

import { useState, useMemo } from 'react';
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  Globe,
  Search,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  FileText,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Loader2,
  Shield,
  TrendingUp
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface CapyWebProgressData {
  status: 'planning' | 'executing' | 'paused' | 'completed' | 'failed';
  confidence: number;
  pagesVisited: number;
  claimsFound: number;
  activePaths: number;
  elapsedMs: number;
  currentPhase?: string;
}

interface CapyWebAnswer {
  question: string;
  answer: unknown;
  confidence: 'verified' | 'high' | 'medium' | 'low' | 'uncertain' | 'contradicted';
  confidenceScore: number;
  sources: Array<{
    url: string;
    domain: string;
    tier: number;
  }>;
  reasoning?: string;
}

interface CapyWebClaim {
  id: string;
  text: string;
  category: string;
  confidence: string;
  confidenceScore: number;
  corroborationCount: number;
  contradictionCount: number;
  sources: Array<{
    url: string;
    domain: string;
    tier: number;
  }>;
}

interface CapyWebStats {
  totalTimeMs: number;
  pagesVisited: number;
  claimsFound: number;
  claimsVerified: number;
  contradictionsFound: number;
  cacheHits: number;
}

interface CapyWebResultData {
  objective: string;
  success: boolean;
  confidence: number;
  answers: CapyWebAnswer[];
  claims: CapyWebClaim[];
  stats: CapyWebStats;
  visitedUrls: string[];
}

// ============================================
// PROGRESS ARTIFACT
// ============================================

export function CapyWebProgressArtifact({ 
  data, 
  onAction 
}: { 
  data: CapyWebProgressData;
  onAction?: (action: string, params?: Record<string, unknown>) => void;
}) {
  const isActive = data.status === 'executing';
  const isPaused = data.status === 'paused';
  
  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  };
  
  const getStatusColor = () => {
    switch (data.status) {
      case 'executing': return 'bg-blue-500';
      case 'paused': return 'bg-yellow-500';
      case 'completed': return 'bg-green-500';
      case 'failed': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };
  
  const getStatusLabel = () => {
    switch (data.status) {
      case 'planning': return 'Planning...';
      case 'executing': return 'Researching';
      case 'paused': return 'Paused';
      case 'completed': return 'Complete';
      case 'failed': return 'Failed';
      default: return data.status;
    }
  };
  
  return (
    <Card className="overflow-hidden border-blue-200 dark:border-blue-800">
      <CardHeader className="pb-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/50 dark:to-indigo-950/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-sm font-medium">Capy Web Research</CardTitle>
              <p className="text-xs text-muted-foreground">{data.currentPhase || 'Researching...'}</p>
            </div>
          </div>
          <Badge className={cn("text-white", getStatusColor())}>
            {isActive && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
            {getStatusLabel()}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="pt-4 space-y-4">
        {/* Confidence Progress */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">Confidence</span>
            <span className="font-medium">{(data.confidence * 100).toFixed(0)}%</span>
          </div>
          <Progress 
            value={data.confidence * 100} 
            className={cn("h-2", isActive && "animate-pulse")}
          />
        </div>
        
        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-3">
          <div className="text-center p-2 bg-muted/50 rounded-lg">
            <div className="text-lg font-semibold">{data.pagesVisited}</div>
            <div className="text-xs text-muted-foreground">Pages</div>
          </div>
          <div className="text-center p-2 bg-muted/50 rounded-lg">
            <div className="text-lg font-semibold">{data.claimsFound}</div>
            <div className="text-xs text-muted-foreground">Claims</div>
          </div>
          <div className="text-center p-2 bg-muted/50 rounded-lg">
            <div className="text-lg font-semibold">{data.activePaths}</div>
            <div className="text-xs text-muted-foreground">Paths</div>
          </div>
          <div className="text-center p-2 bg-muted/50 rounded-lg">
            <div className="text-lg font-semibold">{formatTime(data.elapsedMs)}</div>
            <div className="text-xs text-muted-foreground">Time</div>
          </div>
        </div>
        
        {/* Controls */}
        {(isActive || isPaused) && onAction && (
          <div className="flex gap-2">
            {isActive && (
              <Button 
                size="sm" 
                variant="outline" 
                className="flex-1"
                onClick={() => onAction('capy_web_pause')}
              >
                Pause
              </Button>
            )}
            {isPaused && (
              <Button 
                size="sm" 
                variant="outline" 
                className="flex-1"
                onClick={() => onAction('capy_web_resume')}
              >
                Resume
              </Button>
            )}
            <Button 
              size="sm" 
              variant="destructive" 
              className="flex-1"
              onClick={() => onAction('capy_web_stop')}
            >
              Stop
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// RESULTS ARTIFACT
// ============================================

export function CapyWebResultsArtifact({ 
  data, 
  onAction 
}: { 
  data: CapyWebResultData;
  onAction?: (action: string, params?: Record<string, unknown>) => void;
}) {
  const [activeTab, setActiveTab] = useState<'answers' | 'claims' | 'sources'>('answers');
  const [expandedAnswers, setExpandedAnswers] = useState<Set<number>>(new Set());
  
  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  };
  
  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'verified': return 'bg-green-500 text-white';
      case 'high': return 'bg-green-400 text-white';
      case 'medium': return 'bg-yellow-400 text-gray-900';
      case 'low': return 'bg-orange-400 text-white';
      case 'contradicted': return 'bg-red-500 text-white';
      default: return 'bg-gray-400 text-white';
    }
  };
  
  const getTierLabel = (tier: number) => {
    return `T${tier}`;
  };
  
  const uniqueSources = useMemo(() => {
    const sources = new Map<string, { url: string; domain: string; tier: number }>();
    for (const claim of data.claims) {
      for (const source of claim.sources) {
        if (!sources.has(source.url)) {
          sources.set(source.url, source);
        }
      }
    }
    return Array.from(sources.values());
  }, [data.claims]);
  
  const toggleAnswer = (index: number) => {
    setExpandedAnswers(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };
  
  const formatAnswer = (value: unknown): string => {
    if (value === null || value === undefined) return 'No answer found';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return value.toString();
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };
  
  return (
    <Card className="overflow-hidden border-green-200 dark:border-green-800">
      <CardHeader className="pb-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/50 dark:to-emerald-950/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
              <Search className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <CardTitle className="text-sm font-medium">Research Results</CardTitle>
              <p className="text-xs text-muted-foreground truncate max-w-[200px]">{data.objective}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold text-green-600">{(data.confidence * 100).toFixed(0)}%</div>
            <div className="text-xs text-muted-foreground">confidence</div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-4 space-y-4">
        {/* Stats Summary */}
        <div className="grid grid-cols-4 gap-2 p-3 bg-muted/30 rounded-lg text-center">
          <div>
            <div className="font-semibold">{data.stats.pagesVisited}</div>
            <div className="text-xs text-muted-foreground">Pages</div>
          </div>
          <div>
            <div className="font-semibold">{data.stats.claimsVerified}</div>
            <div className="text-xs text-muted-foreground">Verified</div>
          </div>
          <div>
            <div className="font-semibold text-red-500">{data.stats.contradictionsFound}</div>
            <div className="text-xs text-muted-foreground">Conflicts</div>
          </div>
          <div>
            <div className="font-semibold">{formatTime(data.stats.totalTimeMs)}</div>
            <div className="text-xs text-muted-foreground">Time</div>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
          <button
            onClick={() => setActiveTab('answers')}
            className={cn(
              "flex-1 py-1.5 px-3 text-sm rounded-md transition-colors",
              activeTab === 'answers' 
                ? "bg-background shadow-sm font-medium" 
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Answers ({data.answers.length})
          </button>
          <button
            onClick={() => setActiveTab('claims')}
            className={cn(
              "flex-1 py-1.5 px-3 text-sm rounded-md transition-colors",
              activeTab === 'claims' 
                ? "bg-background shadow-sm font-medium" 
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Claims ({data.claims.length})
          </button>
          <button
            onClick={() => setActiveTab('sources')}
            className={cn(
              "flex-1 py-1.5 px-3 text-sm rounded-md transition-colors",
              activeTab === 'sources' 
                ? "bg-background shadow-sm font-medium" 
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Sources ({uniqueSources.length})
          </button>
        </div>
        
        {/* Content */}
        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {activeTab === 'answers' && data.answers.map((answer, i) => (
            <div key={i} className="p-3 bg-muted/30 rounded-lg space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="font-medium text-sm">{answer.question}</p>
                  <p className="text-sm text-foreground mt-1">
                    {formatAnswer(answer.answer)}
                  </p>
                </div>
                <Badge className={cn("shrink-0 text-xs", getConfidenceColor(answer.confidence))}>
                  {answer.confidence} ({(answer.confidenceScore * 100).toFixed(0)}%)
                </Badge>
              </div>
              
              {answer.sources.length > 0 && (
                <div className="pt-2 border-t border-border/50">
                  <button
                    onClick={() => toggleAnswer(i)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {expandedAnswers.has(i) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {answer.sources.length} source{answer.sources.length !== 1 ? 's' : ''}
                  </button>
                  
                  {expandedAnswers.has(i) && (
                    <div className="mt-2 space-y-1">
                      {answer.sources.map((source, j) => (
                        <a
                          key={j}
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-xs text-blue-600 hover:underline"
                        >
                          <Badge variant="outline" className="text-[10px] px-1">
                            {getTierLabel(source.tier)}
                          </Badge>
                          <span className="truncate">{source.domain}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
              
              {answer.reasoning && (
                <p className="text-xs text-muted-foreground italic">{answer.reasoning}</p>
              )}
            </div>
          ))}
          
          {activeTab === 'claims' && data.claims.slice(0, 10).map((claim, i) => (
            <div key={claim.id || i} className="p-3 bg-muted/30 rounded-lg">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary" className="text-xs">{claim.category}</Badge>
                    <Badge className={cn("text-xs", getConfidenceColor(claim.confidence))}>
                      {(claim.confidenceScore * 100).toFixed(0)}%
                    </Badge>
                  </div>
                  <p className="text-sm">{claim.text}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-green-500" />
                  {claim.corroborationCount} corroborated
                </span>
                {claim.contradictionCount > 0 && (
                  <span className="flex items-center gap-1 text-red-500">
                    <XCircle className="w-3 h-3" />
                    {claim.contradictionCount} contradicted
                  </span>
                )}
              </div>
            </div>
          ))}
          
          {activeTab === 'sources' && uniqueSources.map((source, i) => (
            <a
              key={i}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <Badge variant="outline" className="shrink-0">
                {getTierLabel(source.tier)}
              </Badge>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{source.domain}</p>
                <p className="text-xs text-muted-foreground truncate">{source.url}</p>
              </div>
              <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// EXPORTS
// ============================================

export function CapyWebArtifact({ 
  artifact, 
  onAction 
}: { 
  artifact: { type: string; id: string; data: any };
  onAction?: (action: string, params?: Record<string, unknown>) => void;
}) {
  if (artifact.type === 'capy_web_progress') {
    return <CapyWebProgressArtifact data={artifact.data} onAction={onAction} />;
  }
  
  if (artifact.type === 'capy_web_results') {
    return <CapyWebResultsArtifact data={artifact.data} onAction={onAction} />;
  }
  
  return null;
}
