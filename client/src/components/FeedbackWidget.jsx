import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { apiRequest } from "@/lib/queryClient";
import { MessageSquarePlus, X, Send } from "lucide-react";
const CATEGORIES = [
  { value: "general", key: "feedback.categories.general" },
  { value: "bug", key: "feedback.categories.bug" },
  { value: "feature", key: "feedback.categories.feature" },
  { value: "performance", key: "feedback.categories.performance" },
  { value: "ui", key: "feedback.categories.ui" },
  { value: "content", key: "feedback.categories.content" },
];
export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("general");
  const { toast } = useToast();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const submitMutation = useMutation({
    mutationFn: async (data) => {
      await apiRequest("POST", "/api/feedback", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feedback"] });
      toast({ title: t("feedback.success") });
      setMessage("");
      setCategory("general");
      setOpen(false);
    },
    onError: () => {
      toast({ title: t("feedback.error"), variant: "destructive" });
    },
  });
  const handleSubmit = () => {
    if (!message.trim()) return;
    submitMutation.mutate({ message: message.trim(), category });
  };
  return (
    <div className="relative">
      <Button
        onClick={() => setOpen(!open)}
        variant="ghost"
        size="sm"
        className="gap-1.5"
        data-testid="button-open-feedback"
      >
        <MessageSquarePlus className="w-4 h-4" />
        <span className="hidden sm:inline text-xs font-semibold">
          {t("feedback.title")}
        </span>
      </Button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 z-50 w-80 bg-popover border rounded-xl shadow-2xl p-4 flex flex-col gap-3"
          data-testid="feedback-panel"
        >
          <div className="flex items-center justify-between">
            <h3
              className="text-sm font-semibold"
              data-testid="text-feedback-title"
            >
              {t("feedback.title")}
            </h3>
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7"
              onClick={() => setOpen(false)}
              data-testid="button-close-feedback"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger
              className="h-9 text-sm"
              data-testid="select-feedback-category"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem
                  key={c.value}
                  value={c.value}
                  data-testid={`option-feedback-${c.value}`}
                >
                  {t(c.key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("feedback.placeholder")}
            className="min-h-[80px] text-sm resize-none"
            maxLength={2000}
            data-testid="input-feedback-message"
          />

          <Button
            onClick={handleSubmit}
            disabled={!message.trim() || submitMutation.isPending}
            className="w-full gap-2"
            data-testid="button-submit-feedback"
          >
            <Send className="w-4 h-4" />
            {submitMutation.isPending ? "..." : t("feedback.submit")}
          </Button>
        </div>
      )}
    </div>
  );
}
