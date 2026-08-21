import { Route, Routes } from "react-router-dom";
import { Navbar } from "@/components/navbar";
import { VideoPage } from "@/pages/video-page";
import { LoginPage } from "@/pages/login-page";

function App() {
  return (
    <div className="flex min-h-svh flex-col">
      <Navbar />
      <Routes>
        <Route path="/" element={<VideoPage />} />
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </div>
  );
}

export default App;
