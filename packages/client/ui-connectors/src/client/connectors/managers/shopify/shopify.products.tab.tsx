"use client";

import { connectorsFetch } from "../../../connectors.client";
import { useState, useEffect, useRef } from "react";
import {
  Search,
  Package,
  Layers,
  RefreshCw,
  FolderOpen,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import type {
  ShopifyProduct,
  ShopifyCollection,
} from "../../../lib/shopify/types";
import { ShopifyProductModal } from "./shopify.product.modal";

const PAGE_SIZE = 10;

export function ShopifyProductsTab() {
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [collections, setCollections] = useState<ShopifyCollection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [hasNextPage, setHasNextPage] = useState(false);
  const [endCursor, setEndCursor] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "DRAFT">(
    "ALL",
  );

  const [selectedProduct, setSelectedProduct] = useState<ShopifyProduct | null>(
    null,
  );

  const abortControllerRef = useRef<AbortController | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    connectorsFetch("/api/connectors/shopify/collections")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.collections)) {
          setCollections(data.collections);
        }
      })
      .catch((err) =>
        console.error("Failed to load Shopify collections:", err),
      );
  }, []);

  const loadInitialProducts = async (isRefresh = false) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      if (searchQuery.trim()) params.set("query", searchQuery.trim());
      if (selectedCollectionId) params.set("collectionId", selectedCollectionId);
      if (statusFilter !== "ALL") params.set("status", statusFilter);

      const res = await connectorsFetch(
        `/api/connectors/shopify/products?${params.toString()}`,
        { signal: controller.signal },
      );
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Failed to fetch products");
      }

      setProducts(json.products || []);
      setHasNextPage(Boolean(json.pageInfo?.hasNextPage));
      setEndCursor(json.pageInfo?.endCursor || null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Error fetching products");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const loadMoreProducts = async () => {
    if (!hasNextPage || !endCursor || isLoadingMore || isLoading) return;

    setIsLoadingMore(true);

    try {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("cursor", endCursor);
      if (searchQuery.trim()) params.set("query", searchQuery.trim());
      if (selectedCollectionId) params.set("collectionId", selectedCollectionId);
      if (statusFilter !== "ALL") params.set("status", statusFilter);

      const res = await connectorsFetch(
        `/api/connectors/shopify/products?${params.toString()}`,
      );
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Failed to load more products");
      }

      const newItems: ShopifyProduct[] = json.products || [];
      setProducts((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const deduplicated = newItems.filter((p) => !existingIds.has(p.id));
        return [...prev, ...deduplicated];
      });

      setHasNextPage(Boolean(json.pageInfo?.hasNextPage));
      setEndCursor(json.pageInfo?.endCursor || null);
    } catch (err) {
      console.error("Error loading next product page:", err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadInitialProducts();
    }, 300);
    return () => clearTimeout(timer);
  }, [loadInitialProducts]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isLoadingMore && !isLoading) {
          loadMoreProducts();
        }
      },
      {
        root: null,
        rootMargin: "150px",
        threshold: 0.1,
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isLoadingMore, isLoading, loadMoreProducts]);

  return (
    <div className="space-y-3.5">
      {/* Top Filter & Search Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products by title, vendor, or tag..."
            className="w-full bg-card border border-border rounded-none pl-9 pr-8 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground focus:ring-2 focus:ring-ring/10 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-muted-foreground p-0.5 rounded-none cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Collection Selector */}
        <div className="relative w-full sm:w-56 shrink-0">
          <div className="absolute left-3 top-2.5 text-muted-foreground pointer-events-none">
            <FolderOpen className="w-3.5 h-3.5" />
          </div>
          <select
            value={selectedCollectionId}
            onChange={(e) => setSelectedCollectionId(e.target.value)}
            className="w-full bg-card border border-border rounded-none pl-8 pr-7 py-2 text-xs text-foreground font-medium focus:outline-none focus:border-foreground focus:ring-2 focus:ring-ring/10 transition-all cursor-pointer appearance-none truncate"
          >
            <option value="">All Collections</option>
            {collections.map((col) => (
              <option key={col.id} value={col.id}>
                {col.title} ({col.productsCount})
              </option>
            ))}
          </select>
        </div>

        {/* Status Filters & Refresh */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="bg-secondary p-0.5 rounded-none border border-border flex items-center">
            {(["ALL", "ACTIVE", "DRAFT"] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-none transition-colors cursor-pointer ${
                  statusFilter === st
                    ? "bg-card text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {st === "ALL" ? "All" : st === "ACTIVE" ? "Active" : "Draft"}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => loadInitialProducts(true)}
            disabled={isRefreshing || isLoading}
            title="Refresh product catalog"
            className="p-2 bg-card hover:bg-muted border border-border rounded-none text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-40"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Products Content Area */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((idx) => (
            <div
              key={idx}
              className="p-3.5 bg-card border border-border rounded-none flex items-center gap-3 animate-pulse"
            >
              <div className="w-14 h-14 bg-secondary rounded-none shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="w-3/4 h-3 bg-secondary rounded-none" />
                <div className="w-1/2 h-2.5 bg-secondary rounded-none" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="p-8 text-center bg-destructive-tint border border-destructive/25 rounded-none space-y-2">
          <AlertCircle className="w-6 h-6 text-destructive mx-auto" />
          <p className="text-xs font-semibold text-destructive">{error}</p>
          <button
            type="button"
            onClick={() => loadInitialProducts()}
            className="px-3 py-1 bg-card border border-destructive/25 text-xs text-destructive font-semibold rounded-none hover:bg-destructive-tint"
          >
            Try Again
          </button>
        </div>
      ) : products.length === 0 ? (
        <div className="p-12 text-center bg-card border border-border rounded-none space-y-2">
          <Package className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-sm font-semibold text-foreground">
            No products found
          </p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
            {searchQuery || selectedCollectionId || statusFilter !== "ALL"
              ? "Try adjusting your search query, collection filter, or status."
              : "No products exist in your connected Shopify store catalog."}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {products.map((p) => {
              const currency =
                p.priceRange.minVariantPrice.currencyCode || "USD";
              const minPrice = p.priceRange.minVariantPrice.amount;
              const maxPrice = p.priceRange.maxVariantPrice?.amount;
              const isPriceRange = maxPrice && maxPrice !== minPrice;

              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedProduct(p)}
                  className="group relative p-3.5 bg-card hover:bg-muted border border-border hover:border-input rounded-none transition-all cursor-pointer flex flex-col justify-between"
                >
                  <div className="flex items-start gap-3">
                    {/* Thumbnail */}
                    <div className="w-14 h-14 rounded-none bg-muted border border-border flex items-center justify-center shrink-0 overflow-hidden group-hover:border-input">
                      {p.featuredImageUrl ? (
                        <img
                          src={p.featuredImageUrl}
                          alt={p.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <Package className="w-6 h-6 text-muted-foreground" />
                      )}
                    </div>

                    {/* Title & Vendor */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5">
                        <h4 className="text-xs font-semibold text-foreground truncate leading-snug">
                          {p.title}
                        </h4>
                        <span
                          className={`px-1.5 py-0.5 rounded-none text-[9.5px] font-semibold shrink-0 border ${
                            p.status === "ACTIVE"
                              ? "bg-success-tint text-brand border-brand/20"
                              : p.status === "DRAFT"
                                ? "bg-warning-tint text-warning border-warning/30"
                                : "bg-secondary text-foreground border-border"
                          }`}
                        >
                          {p.status}
                        </span>
                      </div>

                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {p.vendor ? `${p.vendor} • ` : ""}
                        {p.productType || "Product"}
                      </p>

                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs font-semibold text-foreground">
                          {currency} {minPrice}
                          {isPriceRange ? ` - ${maxPrice}` : ""}
                        </span>

                        <span className="text-[10px] text-muted-foreground">•</span>

                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Layers className="w-3 h-3 text-muted-foreground" />
                          {p.variantsCount}{" "}
                          {p.variantsCount === 1 ? "variant" : "variants"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Footer status / stock */}
                  <div className="mt-3 pt-2.5 border-t border-border flex items-center justify-between text-[11px]">
                    <div>
                      {typeof p.totalInventory === "number" &&
                      p.totalInventory > 0 ? (
                        <span className="text-brand font-medium inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-brand" />
                          {p.totalInventory} in stock
                        </span>
                      ) : p.totalInventory === 0 ? (
                        <span className="text-destructive font-medium inline-flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 text-destructive" />
                          Out of stock
                        </span>
                      ) : (
                        <span className="text-muted-foreground font-medium">
                          Inventory untracked
                        </span>
                      )}
                    </div>

                    <span className="text-muted-foreground group-hover:text-foreground font-medium transition-colors">
                      View Details &rarr;
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Infinite Scroll Sentinel & Loading Indicator */}
          <div ref={sentinelRef} className="pt-2 pb-1 flex justify-center">
            {isLoadingMore ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-none bg-muted border border-border text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
                <span>Loading more products...</span>
              </div>
            ) : hasNextPage ? (
              <button
                type="button"
                onClick={loadMoreProducts}
                className="px-3.5 py-1.5 text-xs text-muted-foreground hover:text-foreground bg-card hover:bg-muted border border-border rounded-none transition-all font-medium cursor-pointer"
              >
                Load more products
              </button>
            ) : products.length > 0 ? (
              <span className="text-[11px] text-muted-foreground">
                Showing all {products.length} products
              </span>
            ) : null}
          </div>
        </>
      )}

      {/* Product Variant Details Lightbox Modal */}
      {selectedProduct && (
        <ShopifyProductModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </div>
  );
}
