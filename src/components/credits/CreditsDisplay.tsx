/**
 * CreditsDisplay - Shows current credit balance in header/nav
 * Compact display with quick-buy option
 */

import { useState } from 'react';
import { useCredits } from '@/hooks/useCredits';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Coins, Plus, Loader2, Zap, TrendingUp, AlertTriangle } from 'lucide-react';
import { CreditsPurchase } from '@/components/billing/CreditsPurchase';

interface CreditsDisplayProps {
  variant?: 'compact' | 'full';
  showBuyButton?: boolean;
}

export function CreditsDisplay({ variant = 'compact', showBuyButton = true }: CreditsDisplayProps) {
  const { balance, isLoading, startCheckout } = useCredits();
  const [showBuyDialog, setShowBuyDialog] = useState(false);
  const [quickBuying, setQuickBuying] = useState(false);

  const handleQuickBuy = async (packageId: string) => {
    setQuickBuying(true);
    try {
      const url = await startCheckout(packageId);
      if (url) {
        window.location.href = url;
      }
    } finally {
      setQuickBuying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-full">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading...</span>
      </div>
    );
  }

  const available = balance?.available || 0;
  const isLow = available < 50;
  const isCritical = available < 10;

  if (variant === 'compact') {
    return (
      <>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={`gap-2 ${isCritical ? 'text-red-600' : isLow ? 'text-yellow-600' : ''}`}
            >
              <Coins className={`h-4 w-4 ${isCritical ? 'text-red-500' : isLow ? 'text-yellow-500' : 'text-yellow-500'}`} />
              <span className="font-semibold">{available.toLocaleString()}</span>
              {isCritical && <AlertTriangle className="h-3 w-3 text-red-500" />}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold flex items-center gap-2">
                  <Zap className="h-4 w-4 text-yellow-500" />
                  Credit Balance
                </h4>
                <Badge variant={isCritical ? 'destructive' : isLow ? 'secondary' : 'default'}>
                  {available.toLocaleString()} available
                </Badge>
              </div>

              {/* Balance breakdown */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Base credits</span>
                  <span>{balance?.base.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Purchased</span>
                  <span className="text-green-600">+{balance?.purchased.toLocaleString()}</span>
                </div>
                {balance?.adjustment !== 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Adjustments</span>
                    <span className={balance?.adjustment > 0 ? 'text-green-600' : 'text-red-600'}>
                      {balance?.adjustment > 0 ? '+' : ''}{balance?.adjustment.toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Used</span>
                  <span className="text-orange-600">-{balance?.spent.toLocaleString()}</span>
                </div>
              </div>

              {/* Usage bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Usage</span>
                  <span>{Math.round((balance?.spent || 0) / ((balance?.total || 0) + (balance?.spent || 0)) * 100)}%</span>
                </div>
                <Progress 
                  value={Math.min(100, ((balance?.spent || 0) / ((balance?.total || 0) + (balance?.spent || 0))) * 100)}
                  className="h-2"
                />
              </div>

              {/* Quick actions */}
              <div className="space-y-2">
                {isLow && (
                  <div className={`p-2 rounded-lg text-sm ${isCritical ? 'bg-red-500/10 text-red-600' : 'bg-yellow-500/10 text-yellow-600'}`}>
                    {isCritical 
                      ? '⚠️ Credits almost depleted! Add more to continue.' 
                      : '💡 Running low on credits'}
                  </div>
                )}
                
                {showBuyButton && (
                  <Button 
                    className="w-full" 
                    size="sm"
                    onClick={() => setShowBuyDialog(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Buy Credits
                  </Button>
                )}
              </div>

              {/* Quick buy options */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  disabled={quickBuying}
                  onClick={() => handleQuickBuy('starter')}
                >
                  +100
                  <br />
                  $9.99
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs border-violet-500"
                  disabled={quickBuying}
                  onClick={() => handleQuickBuy('pro')}
                >
                  +500
                  <br />
                  $39.99
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  disabled={quickBuying}
                  onClick={() => handleQuickBuy('enterprise')}
                >
                  +2000
                  <br />
                  $129.99
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Buy Credits Dialog */}
        <Dialog open={showBuyDialog} onOpenChange={setShowBuyDialog}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Buy Credits</DialogTitle>
            </DialogHeader>
            <CreditsPurchase />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Full variant
  return (
    <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-violet-500/10 to-purple-500/10 rounded-lg border border-violet-500/20">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-yellow-500/20 rounded-full">
          <Coins className="h-6 w-6 text-yellow-500" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Available Credits</p>
          <p className="text-2xl font-bold">{available.toLocaleString()}</p>
        </div>
      </div>
      
      <div className="flex-1 flex items-center gap-3">
        <TrendingUp className="h-5 w-5 text-muted-foreground" />
        <div className="flex-1">
          <Progress 
            value={Math.min(100, ((balance?.spent || 0) / ((balance?.total || 0) + (balance?.spent || 0))) * 100)}
            className="h-2"
          />
        </div>
        <span className="text-sm text-muted-foreground">
          {balance?.spent.toLocaleString()} used
        </span>
      </div>

      {showBuyButton && (
        <Button onClick={() => setShowBuyDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Buy Credits
        </Button>
      )}

      <Dialog open={showBuyDialog} onOpenChange={setShowBuyDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Buy Credits</DialogTitle>
          </DialogHeader>
          <CreditsPurchase />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default CreditsDisplay;
