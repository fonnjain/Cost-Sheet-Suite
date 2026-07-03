import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Login from "./pages/login";
import Home from "./pages/home";
import RmPrices from "./pages/rm-prices";
import RmPriceList from "./pages/rm-price-list";
import RmDataVariation from "./pages/rm-data-variation";
import RmRatios from "./pages/rm-ratios";
import Calculator from "./pages/calculator";
import Dashboard from "./pages/dashboard";
import Review from "./pages/review";
import Admin from "./pages/admin";
import { Layout } from "./components/layout";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const apiError = error as { status?: number };
        if (apiError?.status === 401 || apiError?.status === 403) return false;
        return failureCount < 2;
      },
      staleTime: 30_000,
    },
  },
});

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location]);
  return null;
}

function Router() {
  return (
    <>
      <ScrollToTop />
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/">
          <Layout>
            <Home />
          </Layout>
        </Route>
        <Route path="/rm-prices">
          <Layout>
            <RmPrices />
          </Layout>
        </Route>
        <Route path="/rm-price-list">
          <Layout>
            <RmPriceList />
          </Layout>
        </Route>
        <Route path="/rm-data-variation">
          <Layout>
            <RmDataVariation />
          </Layout>
        </Route>
        <Route path="/rm-ratios">
          <Layout>
            <RmRatios />
          </Layout>
        </Route>
        <Route path="/calculator">
          <Layout>
            <Calculator />
          </Layout>
        </Route>
        <Route path="/dashboard">
          <Layout>
            <Dashboard />
          </Layout>
        </Route>
        <Route path="/review">
          <Layout>
            <Review />
          </Layout>
        </Route>
        <Route path="/admin">
          <Layout>
            <Admin />
          </Layout>
        </Route>
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
