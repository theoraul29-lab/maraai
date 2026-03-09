import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft,
  Crown,
  Check,
  Clock,
  X,
  Sparkles,
  MessageCircle,
  Mic,
  Palette,
  Brain,
  Ban,
  CreditCard,
  Copy,
  Loader2,
} from "lucide-react";
import { SiPaypal } from "react-icons/si";
const BANK_IBAN = "BE83 9741 5006 8915";
const BANK_HOLDER = "Laszlo Raul-Teodor";
const PREMIUM_AMOUNT = "9.00";
function PayPalButton({ onSuccess }) {
  const paypalContainerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { toast } = useToast();
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const loadPayPal = useCallback(async () => {
    try {
      const res = await fetch("/api/premium/paypal/client-id");
      if (!res.ok) {
        setError("PayPal not available");
        setLoading(false);
        return;
      }
      const { clientId } = await res.json();
      if (document.getElementById("paypal-sdk-script")) {
        setLoading(false);
        return;
      }
      const script = document.createElement("script");
      script.id = "paypal-sdk-script";
      script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=EUR`;
      script.async = true;
      script.onload = () => {
        setLoading(false);
        renderButton();
      };
      script.onerror = () => {
        setError("Failed to load PayPal");
        setLoading(false);
      };
      document.head.appendChild(script);
    } catch {
      setError("PayPal not available");
      setLoading(false);
    }
  }, []);
  const renderButton = useCallback(() => {
    if (!paypalContainerRef.current || !window.paypal) return;
    paypalContainerRef.current.innerHTML = "";
    window.paypal
      .Buttons({
        style: {
          layout: "vertical",
          color: "gold",
          shape: "rect",
          label: "pay",
          height: 48,
        },
        createOrder: async () => {
          const res = await apiRequest(
            "POST",
            "/api/premium/paypal/create-order",
          );
          const data = await res.json();
          return data.orderID;
        },
        onApprove: async (data) => {
          try {
            const res = await apiRequest(
              "POST",
              "/api/premium/paypal/capture-order",
              {
                orderID: data.orderID,
              },
            );
            const result = await res.json();
            if (result.success) {
              toast({ title: "Payment successful! Premium activated." });
              onSuccessRef.current();
            } else {
              toast({ title: "Payment issue", variant: "destructive" });
            }
          } catch {
            toast({ title: "Payment failed", variant: "destructive" });
          }
        },
        onError: () => {
          toast({ title: "PayPal error", variant: "destructive" });
        },
      })
      .render(paypalContainerRef.current);
  }, [toast]);
  useEffect(() => {
    loadPayPal();
  }, [loadPayPal]);
  useEffect(() => {
    if (!loading && !error && window.paypal) {
      renderButton();
    }
  }, [loading, error, renderButton]);
  if (error) {
    return (
      <div
        className="text-center py-6 text-muted-foreground text-sm"
        data-testid="text-paypal-error"
      >
        {error}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}
      <div ref={paypalContainerRef} data-testid="paypal-button-container" />
    </div>
  );
}
export default function PremiumPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [copied, setCopied] = useState(null);
  const { data: status } = useQuery({
    queryKey: ["/api/premium/status"],
    enabled: !!user,
  });
  const orderMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/premium/order", {
        transferReference: reference,
        notes: notes || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/premium/status"] });
      toast({ title: t("premium.orderSubmitted") });
      setReference("");
      setNotes("");
    },
    onError: () => {
      toast({ title: "Error", variant: "destructive" });
    },
  });
  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };
  const features = [
    { icon: MessageCircle, key: "premium.feature.unlimitedChat" },
    { icon: Mic, key: "premium.feature.voiceAi" },
    { icon: Sparkles, key: "premium.feature.prioritySupport" },
    { icon: Palette, key: "premium.feature.exclusiveThemes" },
    { icon: Brain, key: "premium.feature.advancedAnalysis" },
    { icon: Ban, key: "premium.feature.noAds" },
  ];
  const hasPendingOrder = status?.orders?.some((o) => o.status === "pending");
  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-30 backdrop-blur-xl bg-background/60 border-b border-white/5">
        <div className="flex items-center gap-3 px-4 md:px-6 lg:px-8 py-3 max-w-[900px] mx-auto">
          <Link href="/">
            <Button
              variant="ghost"
              size="icon"
              data-testid="button-premium-back"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <h1
            className="text-lg font-bold tracking-tight flex items-center gap-2"
            data-testid="text-premium-title"
          >
            <Crown className="w-5 h-5 text-yellow-500" /> {t("premium.title")}
          </h1>
        </div>
      </div>

      <div className="max-w-[900px] mx-auto px-4 md:px-6 lg:px-8 py-8 space-y-8">
        {status?.isPremium && (
          <div className="bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border border-yellow-500/30 rounded-2xl p-6 text-center">
            <Crown className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
            <h2
              className="text-2xl font-bold text-yellow-400 mb-1"
              data-testid="text-premium-active"
            >
              {t("premium.active")}
            </h2>
            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
              {t("premium.confirmed")}
            </Badge>
          </div>
        )}

        <div className="text-center space-y-3">
          <h2 className="text-3xl md:text-4xl font-bold">
            {t("premium.title")}
          </h2>
          <p className="text-muted-foreground text-lg max-w-lg mx-auto">
            {t("premium.subtitle")}
          </p>
          <div className="flex items-center justify-center gap-2">
            <span className="text-4xl font-bold text-primary">
              {t("premium.price")}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("premium.priceNote")}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {features.map(({ icon: Icon, key }) => (
            <Card key={key} className="border-white/10">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <span className="font-medium text-sm">{t(key)}</span>
              </CardContent>
            </Card>
          ))}
        </div>

        {!status?.isPremium && (
          <>
            <Tabs defaultValue="paypal">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger
                  value="paypal"
                  data-testid="tab-paypal"
                  className="gap-2"
                >
                  <SiPaypal className="w-4 h-4" />
                  {t("premium.paypal")}
                </TabsTrigger>
                <TabsTrigger
                  value="bank"
                  data-testid="tab-bank"
                  className="gap-2"
                >
                  <CreditCard className="w-4 h-4" />
                  {t("premium.bankTransfer")}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="paypal" className="mt-4">
                <Card className="border-primary/20">
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <SiPaypal className="w-5 h-5 text-[#0070ba]" />
                      <h3 className="text-lg font-semibold">
                        {t("premium.paypalTitle")}
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t("premium.paypalDesc")}
                    </p>
                    <PayPalButton
                      onSuccess={() => {
                        queryClient.invalidateQueries({
                          queryKey: ["/api/premium/status"],
                        });
                      }}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="bank" className="mt-4">
                <Card className="border-primary/20">
                  <CardContent className="p-6 space-y-5">
                    <div className="flex items-center gap-2 mb-2">
                      <CreditCard className="w-5 h-5 text-primary" />
                      <h3 className="text-lg font-semibold">
                        {t("premium.bankDetails")}
                      </h3>
                    </div>

                    <p className="text-sm text-muted-foreground">
                      {t("premium.instructions")}
                    </p>

                    <div className="space-y-4 bg-card/50 rounded-xl p-4 border border-white/5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide">
                            {t("premium.iban")}
                          </p>
                          <p
                            className="font-mono font-semibold text-sm mt-0.5"
                            data-testid="text-iban"
                          >
                            {BANK_IBAN}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(BANK_IBAN, "iban")}
                          data-testid="button-copy-iban"
                        >
                          {copied === "iban" ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide">
                            {t("premium.accountHolder")}
                          </p>
                          <p
                            className="font-semibold text-sm mt-0.5"
                            data-testid="text-holder"
                          >
                            {BANK_HOLDER}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(BANK_HOLDER, "holder")}
                          data-testid="button-copy-holder"
                        >
                          {copied === "holder" ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">
                          Amount
                        </p>
                        <p className="font-bold text-lg text-primary mt-0.5">
                          {PREMIUM_AMOUNT} EUR
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3 pt-2">
                      <div>
                        <label className="text-sm font-medium mb-1.5 block">
                          {t("premium.reference")}
                        </label>
                        <Input
                          value={reference}
                          onChange={(e) => setReference(e.target.value)}
                          placeholder={t("premium.referencePlaceholder")}
                          data-testid="input-reference"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1.5 block">
                          {t("premium.notes")}
                        </label>
                        <Textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder={t("premium.notesPlaceholder")}
                          rows={2}
                          data-testid="input-notes"
                        />
                      </div>
                      <Button
                        onClick={() => orderMutation.mutate()}
                        disabled={
                          !reference.trim() ||
                          orderMutation.isPending ||
                          hasPendingOrder
                        }
                        className="w-full h-12 rounded-xl text-base"
                        data-testid="button-submit-order"
                      >
                        <Crown className="w-5 h-5 mr-2" />
                        {hasPendingOrder
                          ? t("premium.pending")
                          : t("premium.submit")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {status?.orders && status.orders.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                  Order History
                </h3>
                {status.orders.map((order) => (
                  <Card key={order.id} className="border-white/10">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          #{order.id} — {order.amount} {order.currency}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {order.transferReference} —{" "}
                          {new Date(order.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge
                        variant={
                          order.status === "confirmed"
                            ? "default"
                            : order.status === "rejected"
                              ? "destructive"
                              : "secondary"
                        }
                        className={
                          order.status === "confirmed"
                            ? "bg-green-500/20 text-green-400 border-green-500/30"
                            : ""
                        }
                        data-testid={`badge-order-${order.id}`}
                      >
                        {order.status === "pending" && (
                          <Clock className="w-3 h-3 mr-1" />
                        )}
                        {order.status === "confirmed" && (
                          <Check className="w-3 h-3 mr-1" />
                        )}
                        {order.status === "rejected" && (
                          <X className="w-3 h-3 mr-1" />
                        )}
                        {order.status === "pending"
                          ? t("premium.pending")
                          : order.status === "confirmed"
                            ? t("premium.confirmed")
                            : t("premium.rejected")}
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
