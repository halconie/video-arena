import { Route, Routes } from "react-router-dom";
import { Navbar } from "@/components/navbar";
import { VideoPage } from "@/pages/video-page";
import { ImagePage } from "@/pages/image-page";
import { FaceSwapPage } from "@/pages/faceswap-page";
import { AvatarPage } from "@/pages/avatar-page";
import { TemplatesPage } from "@/pages/templates-page";
import { AdminTemplatePage } from "@/pages/admin-template-page";
import { LoginPage } from "@/pages/login-page";

function App() {
  return (
    <div className="flex min-h-svh flex-col">
      <Navbar />
      <Routes>
        <Route path="/" element={<VideoPage />} />
        <Route path="/image" element={<ImagePage />} />
        <Route path="/face-swap" element={<FaceSwapPage />} />
        <Route path="/user/avatar" element={<AvatarPage />} />
        <Route path="/user/templates" element={<TemplatesPage />} />
        <Route path="/admin/template/create" element={<AdminTemplatePage />} />
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </div>
  );
}

export default App;
