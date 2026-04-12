import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider } from "@/auth/AuthContext";

const queryClient = new QueryClient();

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://api.fontshare.com/v2/css?f[]=clash-display@700&f[]=satoshi@500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[#f2f2f2] text-[#111111] font-satoshi selection:bg-[#111111] selection:text-[#f2f2f2]">
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            {children}
            <Toaster position="top-right" richColors closeButton />
          </AuthProvider>
        </QueryClientProvider>
      </body>
    </html>
  );
}
