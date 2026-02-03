// ============================================================================
// CAPY WEB - RESULTS COMPONENT
// Display research results with answers, claims, and sources
// ============================================================================

import React, { useState, useMemo } from 'react';
import { 
  CapyWebResult, 
  Answer, 
  Claim, 
  ClaimConfidence, 
  ClaimSource,
  ExecutionStats 
} from '../types';

// ============================================================================
// CONFIDENCE BADGE
// ============================================================================

interface ConfidenceBadgeProps {
  confidence: ClaimConfidence;
  score?: number;
  size?: 'sm' | 'md' | 'lg';
}

export function ConfidenceBadge({ confidence, score, size = 'md' }: ConfidenceBadgeProps) {
  const config = {
    [ClaimConfidence.VERIFIED]: { label: 'Verified', color: 'bg-green-500', textColor: 'text-white' },
    [ClaimConfidence.HIGH]: { label: 'High', color: 'bg-green-400', textColor: 'text-white' },
    [ClaimConfidence.MEDIUM]: { label: 'Medium', color: 'bg-yellow-400', textColor: 'text-gray-900' },
    [ClaimConfidence.LOW]: { label: 'Low', color: 'bg-orange-400', textColor: 'text-white' },
    [ClaimConfidence.UNCERTAIN]: { label: 'Uncertain', color: 'bg-gray-400', textColor: 'text-white' },
    [ClaimConfidence.CONTRADICTED]: { label: 'Contradicted', color: 'bg-red-500', textColor: 'text-white' }
  };
  
  const { label, color, textColor } = config[confidence] || config[ClaimConfidence.UNCERTAIN];
  
  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm'
  };
  
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${color} ${textColor} ${sizeClasses[size]}`}>
      {label}
      {score !== undefined && (
        <span className="opacity-75">({(score * 100).toFixed(0)}%)</span>
      )}
    </span>
  );
}

// ============================================================================
// SOURCE LINK
// ============================================================================

interface SourceLinkProps {
  source: ClaimSource;
  showTier?: boolean;
}

export function SourceLink({ source, showTier = false }: SourceLinkProps) {
  const tierLabels = {
    1: 'T1',
    2: 'T2',
    3: 'T3',
    4: 'T4',
    5: 'T5'
  };
  
  return (
    <div className="flex items-center gap-2 text-sm">
      {showTier && (
        <span className="px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 rounded">
          {tierLabels[source.tier] || 'T?'}
        </span>
      )}
      <a 
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 dark:text-blue-400 hover:underline truncate max-w-xs"
      >
        {source.domain}
      </a>
      <span className="text-gray-400 text-xs">
        {new Date(source.timestamp).toLocaleDateString()}
      </span>
    </div>
  );
}

// ============================================================================
// ANSWER CARD
// ============================================================================

interface AnswerCardProps {
  answer: Answer;
  expanded?: boolean;
  onToggle?: () => void;
}

export function AnswerCard({ answer, expanded, onToggle }: AnswerCardProps) {
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
    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="font-medium text-gray-900 dark:text-white mb-1">
            {answer.question}
          </h3>
          <div className="text-gray-700 dark:text-gray-300">
            {formatAnswer(answer.answer)}
          </div>
        </div>
        <ConfidenceBadge 
          confidence={answer.confidence} 
          score={answer.confidenceScore}
        />
      </div>
      
      {(expanded || answer.sources.length <= 2) && answer.sources.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Sources ({answer.sources.length})
          </div>
          <div className="space-y-1">
            {answer.sources.map((source, i) => (
              <SourceLink key={i} source={source} showTier />
            ))}
          </div>
        </div>
      )}
      
      {!expanded && answer.sources.length > 2 && (
        <button
          onClick={onToggle}
          className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          Show {answer.sources.length} sources
        </button>
      )}
      
      {answer.reasoning && (
        <div className="mt-2 text-sm text-gray-500 dark:text-gray-400 italic">
          {answer.reasoning}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// CLAIM CARD
// ============================================================================

interface ClaimCardProps {
  claim: Claim;
  compact?: boolean;
}

export function ClaimCard({ claim, compact = false }: ClaimCardProps) {
  const [showSources, setShowSources] = useState(false);
  
  if (compact) {
    return (
      <div className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded">
        <ConfidenceBadge confidence={claim.confidence} size="sm" />
        <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">
          {claim.text}
        </span>
        <span className="text-xs text-gray-400">
          {claim.sources.length} source{claim.sources.length !== 1 ? 's' : ''}
        </span>
      </div>
    );
  }
  
  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 rounded">
              {claim.category}
            </span>
            <ConfidenceBadge confidence={claim.confidence} score={claim.confidenceScore} size="sm" />
          </div>
          <p className="text-gray-800 dark:text-gray-200">{claim.text}</p>
        </div>
      </div>
      
      <div className="mt-3 flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
        <span>
          {claim.corroborationCount} corroboration{claim.corroborationCount !== 1 ? 's' : ''}
        </span>
        {claim.contradictionCount > 0 && (
          <span className="text-red-500">
            {claim.contradictionCount} contradiction{claim.contradictionCount !== 1 ? 's' : ''}
          </span>
        )}
        <button
          onClick={() => setShowSources(!showSources)}
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          {showSources ? 'Hide' : 'Show'} sources
        </button>
      </div>
      
      {showSources && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-1">
          {claim.sources.map((source, i) => (
            <SourceLink key={i} source={source} showTier />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// STATS PANEL
// ============================================================================

interface StatsPanelProps {
  stats: ExecutionStats;
}

export function StatsPanel({ stats }: StatsPanelProps) {
  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  };
  
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <div className="text-center">
        <div className="text-2xl font-bold text-gray-900 dark:text-white">
          {stats.pagesVisited}
        </div>
        <div className="text-xs text-gray-500">Pages Visited</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-gray-900 dark:text-white">
          {stats.claimsFound}
        </div>
        <div className="text-xs text-gray-500">Claims Found</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-green-600">
          {stats.claimsVerified}
        </div>
        <div className="text-xs text-gray-500">Verified</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-gray-900 dark:text-white">
          {formatTime(stats.totalTimeMs)}
        </div>
        <div className="text-xs text-gray-500">Total Time</div>
      </div>
      
      {/* Second row */}
      <div className="text-center">
        <div className="text-lg font-semibold text-gray-700 dark:text-gray-300">
          {stats.cacheHits}
        </div>
        <div className="text-xs text-gray-500">Cache Hits</div>
      </div>
      <div className="text-center">
        <div className="text-lg font-semibold text-gray-700 dark:text-gray-300">
          {stats.pathsExecuted}
        </div>
        <div className="text-xs text-gray-500">Paths Executed</div>
      </div>
      <div className="text-center">
        <div className="text-lg font-semibold text-red-600">
          {stats.contradictionsFound}
        </div>
        <div className="text-xs text-gray-500">Contradictions</div>
      </div>
      <div className="text-center">
        <div className="text-lg font-semibold text-gray-700 dark:text-gray-300">
          {(stats.avgConfidencePerPage * 100).toFixed(1)}%
        </div>
        <div className="text-xs text-gray-500">Avg Conf/Page</div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN RESULTS COMPONENT
// ============================================================================

interface CapyWebResultsProps {
  result: CapyWebResult;
  showStats?: boolean;
  showClaims?: boolean;
  showSources?: boolean;
  maxClaims?: number;
}

export function CapyWebResults({
  result,
  showStats = true,
  showClaims = true,
  showSources = true,
  maxClaims = 10
}: CapyWebResultsProps) {
  const [activeTab, setActiveTab] = useState<'answers' | 'claims' | 'sources'>('answers');
  const [expandedAnswers, setExpandedAnswers] = useState<Set<string>>(new Set());
  
  // Sort claims by confidence
  const sortedClaims = useMemo(() => {
    return [...result.claims]
      .sort((a, b) => b.confidenceScore - a.confidenceScore)
      .slice(0, maxClaims);
  }, [result.claims, maxClaims]);
  
  // Unique sources
  const uniqueSources = useMemo(() => {
    const sources = new Map<string, ClaimSource>();
    for (const claim of result.claims) {
      for (const source of claim.sources) {
        if (!sources.has(source.url)) {
          sources.set(source.url, source);
        }
      }
    }
    return Array.from(sources.values());
  }, [result.claims]);
  
  const toggleAnswer = (questionId: string) => {
    setExpandedAnswers(prev => {
      const next = new Set(prev);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Research Results
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {result.objective}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-green-600">
            {(result.confidence * 100).toFixed(0)}%
          </div>
          <div className="text-xs text-gray-500">Overall Confidence</div>
        </div>
      </div>
      
      {/* Stats */}
      {showStats && <StatsPanel stats={result.stats} />}
      
      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('answers')}
            className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'answers'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Answers ({result.answers.length})
          </button>
          {showClaims && (
            <button
              onClick={() => setActiveTab('claims')}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'claims'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Claims ({result.claims.length})
            </button>
          )}
          {showSources && (
            <button
              onClick={() => setActiveTab('sources')}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'sources'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Sources ({uniqueSources.length})
            </button>
          )}
        </nav>
      </div>
      
      {/* Content */}
      <div className="space-y-4">
        {activeTab === 'answers' && (
          <>
            {result.answers.map((answer) => (
              <AnswerCard
                key={answer.questionId}
                answer={answer}
                expanded={expandedAnswers.has(answer.questionId)}
                onToggle={() => toggleAnswer(answer.questionId)}
              />
            ))}
          </>
        )}
        
        {activeTab === 'claims' && (
          <>
            {sortedClaims.map((claim) => (
              <ClaimCard key={claim.id} claim={claim} />
            ))}
            {result.claims.length > maxClaims && (
              <p className="text-sm text-gray-500 text-center">
                Showing top {maxClaims} of {result.claims.length} claims
              </p>
            )}
          </>
        )}
        
        {activeTab === 'sources' && (
          <div className="grid gap-2">
            {uniqueSources.map((source, i) => (
              <div 
                key={i}
                className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
              >
                <SourceLink source={source} showTier />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
