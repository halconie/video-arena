import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthForm } from "@/components/auth-form";
import { useSession } from "@/lib/auth-client";

/**
 * Renders `children` only for signed-in users; otherwise shows the sign-in
 * form with the given prompt. Shared by the video, image and face-swap pages.
 */
export function RequireSession({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { data: session, isPending } = useSession();

  if (isPending) return null;

  if (!session) {
    return (
      <div className="mx-auto flex max-w-sm flex-1 items-center px-4 py-12">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>{title}</CardTitle>
          </CardHeader>
          <CardContent>
            <AuthForm />
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
