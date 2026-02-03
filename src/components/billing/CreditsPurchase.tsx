/**
 * Credits Purchase Component
 * 
 * Displays credit packages and handles Stripe checkout
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Zap, Check, CreditCard, TrendingUp, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CreditPackage {
  id: string;
  name: string;
  description: string;
  credits: number;
  price_cents: number;
  currency: string;
  popular: boolean;
  savings_percent: number | null;
}

interface CreditBalance {
  total: number;
  base: number;
  purchased: number;
  adjustment: number;
  spent: number;
  available: number;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  package_id: string;
  amount_paid: number;
  created_at: string;
}

export function CreditsPurchase() {
  const { session } = useAuth();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    if (session?.access_token) {
      loadCreditsData();
    }
  }, [session?.access_token]);

  const loadCreditsData = async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-credits`,
        {
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) throw new Error('Failed to load credits');

      const data = await response.json();
      setBalance(data.balance);
      setPackages(data.packages);
      setTransactions(data.recentTransactions);
    } catch (error) {
      console.error('Error loading credits:', error);
      toast({
        title: 'Error',
        description: 'Failed to load credit information',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (packageId: string) => {
    setPurchasing(packageId);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            packageId,
            successUrl: `${window.location.origin}/dashboard?payment=success`,
            cancelUrl: `${window.location.origin}/dashboard?payment=cancelled`,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Checkout failed');
      }

      const { url } = await response.json();
      
      if (url) {
        window.location.href = url;
      }
    } catch (error) {
      console.error('Checkout error:', error);
      toast({
        title: 'Checkout Failed',
        description: error instanceof Error ? error.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setPurchasing(null);
    }
  };

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Current Balance */}
      <Card className="bg-gradient-to-br from-violet-500/10 to-purple-500/10 border-violet-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Your Credit Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-bold">{balance?.available.toLocaleString()}</span>
            <span className="text-muted-foreground">credits available</span>
          </div>
          
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Base</p>
              <p className="font-medium">{balance?.base.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Purchased</p>
              <p className="font-medium text-green-600">+{balance?.purchased.toLocaleString()}</p>
            </div>
            {balance?.adjustment !== 0 && (
              <div>
                <p className="text-muted-foreground">Adjustments</p>
                <p className={`font-medium ${balance?.adjustment > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {balance?.adjustment > 0 ? '+' : ''}{balance?.adjustment.toLocaleString()}
                </p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground">Used</p>
              <p className="font-medium text-orange-600">-{balance?.spent.toLocaleString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Credit Packages */}
      <div>
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-yellow-500" />
          Buy Credits
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {packages.map((pkg) => (
            <Card 
              key={pkg.id}
              className={`relative ${pkg.popular ? 'border-2 border-violet-500 shadow-lg' : ''}`}
            >
              {pkg.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-violet-500">
                  Most Popular
                </Badge>
              )}
              
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {pkg.name}
                  {pkg.savings_percent && (
                    <Badge variant="secondary" className="text-green-600">
                      Save {pkg.savings_percent}%
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>{pkg.description}</CardDescription>
              </CardHeader>
              
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold">{formatPrice(pkg.price_cents)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {pkg.credits.toLocaleString()} credits
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatPrice(Math.round(pkg.price_cents / pkg.credits * 100))} per 100 credits
                  </p>
                </div>
              </CardContent>
              
              <CardFooter>
                <Button
                  className="w-full"
                  variant={pkg.popular ? 'default' : 'outline'}
                  onClick={() => handlePurchase(pkg.id)}
                  disabled={purchasing !== null}
                >
                  {purchasing === pkg.id ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CreditCard className="mr-2 h-4 w-4" />
                      Buy Now
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>

      {/* Recent Transactions */}
      {transactions.length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Recent Transactions
          </h2>
          
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-medium capitalize">
                        {tx.type.replace('_', ' ')}
                        {tx.package_id && ` - ${tx.package_id}`}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(tx.created_at)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()} credits
                      </p>
                      {tx.amount_paid && (
                        <p className="text-sm text-muted-foreground">
                          {formatPrice(tx.amount_paid)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Credit Usage Info */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-lg">How Credits Work</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-500" />
              <span><strong>Lead Discovery:</strong> 1 credit per lead found</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-500" />
              <span><strong>Email Generation:</strong> 2 credits per personalized email</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-500" />
              <span><strong>Email Sending:</strong> 1 credit per email sent</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-500" />
              <span><strong>AI Chat:</strong> Free unlimited conversations</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export default CreditsPurchase;
