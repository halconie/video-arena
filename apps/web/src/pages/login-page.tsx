import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthForm } from "@/components/auth-form";

export function LoginPage() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto flex max-w-sm flex-1 items-center px-4 py-12">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Sign in to Video Arena</CardTitle>
        </CardHeader>
        <CardContent>
          <AuthForm onSuccess={() => navigate("/")} />
        </CardContent>
      </Card>
    </div>
  );
}
