import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
export default function NotFound() {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <h1
              className="text-2xl font-bold"
              data-testid="text-not-found-title"
            >
              {t("notFound.title")}
            </h1>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            {t("notFound.desc")}
          </p>

          <Link href="/">
            <Button className="mt-4" data-testid="button-go-home">
              {t("notFound.back")}
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
