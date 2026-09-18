import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Landing from "@/pages/Landing";
import Terms from "@/pages/Terms";
import Privacy from "@/pages/Privacy";
import DeleteAccount from "@/pages/DeleteAccount";
import AdminLogin from "@/pages/admin/AdminLogin";
import AdminLayout from "@/components/admin/AdminLayout";
import Dashboard from "@/pages/admin/Dashboard";
import Users from "@/pages/admin/Users";
import UserDetail from "@/pages/admin/UserDetail";
import Staff from "@/pages/admin/Staff";
import Products from "@/pages/admin/Products";
import Queries from "@/pages/admin/Queries";
import Rates from "@/pages/admin/Rates";
import Settings from "@/pages/admin/Settings";
import CatalogAuthor from '@/pages/admin/CatalogAuthor';
import PdfImport from '@/pages/admin/PdfImport';
import Batches from '@/pages/admin/Batches';
import Content from '@/pages/admin/Content';
import MediaUsage from '@/pages/admin/MediaUsage';
import Leads from '@/pages/admin/Leads';
import Rewards from '@/pages/admin/Rewards';
import Winback from '@/pages/admin/Winback';
import Account from '@/pages/admin/Account';
import "@/App.css";
import '@/shared.css';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/delete-account" element={<DeleteAccount />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="users" element={<Users />} />
          <Route path="users/:id" element={<UserDetail />} />
          <Route path="staff" element={<Staff />} />
          <Route path="products" element={<Products />} />
          <Route path="queries" element={<Queries />} />
          <Route path="rates" element={<Rates />} />
          <Route path="leads" element={<Leads />} />
          <Route path="rewards" element={<Rewards />} />
          <Route path="winback" element={<Winback />} />
          <Route path="catalog-author" element={<CatalogAuthor />} />
          <Route path="pdf-import" element={<PdfImport />} />
          <Route path="batches" element={<Batches />} />
          <Route path="banners" element={<Content onlyBanners />} />
          <Route path="content" element={<Content />} />
          <Route path="media" element={<MediaUsage />} />
          <Route path="settings" element={<Settings />} />
          <Route path="account" element={<Account />} />
        </Route>
      </Routes>
      <Toaster position="top-center" richColors closeButton />
    </BrowserRouter>
  );
}
