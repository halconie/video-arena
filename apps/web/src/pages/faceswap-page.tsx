import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateFaceSwapForm } from "@/components/create-faceswap-form";
import { FaceSwapList } from "@/components/faceswap-list";
import { RequireSession } from "@/components/require-session";
import { useSession } from "@/lib/auth-client";
import { listFaceSwaps, type FaceSwap } from "@/lib/api";

export function FaceSwapPage() {
  return (
    <RequireSession title="Sign in to swap faces">
      <FaceSwapWorkspace />
    </RequireSession>
  );
}

function FaceSwapWorkspace() {
  const { data: session } = useSession();
  const [faceSwaps, setFaceSwaps] = useState<FaceSwap[]>([]);
  const [tab, setTab] = useState("create");

  useEffect(() => {
    if (!session) return;
    listFaceSwaps()
      .then(setFaceSwaps)
      .catch(() => {});
  }, [session]);

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="create">Swap a face</TabsTrigger>
          <TabsTrigger value="swaps">Your face swaps</TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="pt-6">
          <CreateFaceSwapForm
            onCreated={(faceSwap) => {
              setFaceSwaps((prev) => [faceSwap, ...prev]);
              setTab("swaps");
            }}
          />
        </TabsContent>

        <TabsContent value="swaps" className="pt-6">
          <FaceSwapList faceSwaps={faceSwaps} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
