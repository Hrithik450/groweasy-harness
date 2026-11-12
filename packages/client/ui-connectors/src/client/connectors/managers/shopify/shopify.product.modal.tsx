"use client";

import { useState } from "react";
import {
  ArrowLeft,
  X,
  ExternalLink,
  Package,
  Tag,
  Layers,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  BaseManagerModalDialog,
  BaseManagerModalHeader,
  BaseManagerModalTabs,
  BaseManagerModalFooter,
} from "../base.modal";
import type { ShopifyProduct } from "../../../lib/shopify/types";

interface ShopifyProductModalProps {
  product: ShopifyProduct;
  onClose: () => void;
}

type ShopifyProductSubTabId = "details";

export function ShopifyProductModal({
  product,
  onClose,
}: ShopifyProductModalProps) {
  const [activeTabId, setActiveTabId] =
    useState<ShopifyProductSubTabId>("details");

  const currency = product.priceRange.minVariantPrice.currencyCode || "USD";
  const minPrice = product.priceRange.minVariantPrice.amount;
  const maxPrice = product.priceRange.maxVariantPrice?.amount;
  const isPriceRange = maxPrice && maxPrice !== minPrice;

  return (
    <BaseManagerModalDialog
      isOpen={true}
      onClose={onClose}
      hideBackdrop={true}
      className="z-[60]"
    >
      {/* Top Header matching Meta submodal shape */}
      <div className="h-[68px] flex items-center justify-between px-5 sm:px-6 border-b border-border bg-card shrink-0">
        <div className="flex items-center space-x-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-none bg-card border border-border hover:border-input hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center shrink-0 transition-colors cursor-pointer"
            title="Back to Products"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center space-x-2">
              <h2 className="text-[13.5px] font-semibold text-foreground truncate leading-tight">
                {product.title}
              </h2>

              <span
                className={`px-2 py-0.5 rounded-none text-[10.5px] font-semibold border shrink-0 ${
                  product.status === "ACTIVE"
                    ? "bg-success-tint text-brand border-brand/20"
                    : product.status === "DRAFT"
                      ? "bg-warning-tint text-warning border-warning/30"
                      : "bg-secondary text-foreground border-border"
                }`}
              >
                {product.status}
              </span>
            </div>

            <div className="flex items-center space-x-2 text-xs text-muted-foreground mt-0.5 leading-tight truncate">
              {product.vendor && <span>Vendor: {product.vendor}</span>}
              {product.productType && <span>• Type: {product.productType}</span>}
              <span className="text-muted-foreground font-mono text-[11px] truncate">
                • {product.handle}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground p-1.5 rounded-none hover:bg-secondary transition-colors cursor-pointer shrink-0"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Product Details Tab */}
      <BaseManagerModalTabs
        tabs={[{ id: "details", label: "Product Details" }]}
        activeTab={activeTabId}
        onChange={(id) => setActiveTabId(id as ShopifyProductSubTabId)}
      />

      {/* Content Body matching exact parent dimensions */}
      <div className="p-5 sm:p-6 overflow-y-auto space-y-4 bg-card flex-1 no-scrollbar">
        {/* Top Product Hero Card */}
        <div className="bg-card border border-border rounded-none p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-16 h-16 rounded-none bg-card border border-border flex items-center justify-center shrink-0 overflow-hidden">
              {product.featuredImageUrl ? (
                <img
                  src={product.featuredImageUrl}
                  alt={product.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Package className="w-7 h-7 text-muted-foreground" />
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground leading-snug">
                {product.title}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-semibold text-foreground">
                  {currency} {minPrice}
                  {isPriceRange ? ` - ${maxPrice}` : ""}
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="text-xs text-muted-foreground">
                  {product.variants.length}{" "}
                  {product.variants.length === 1 ? "variant" : "variants"}
                </span>
              </div>
            </div>
          </div>

          <div className="text-right shrink-0">
            {typeof product.totalInventory === "number" &&
            product.totalInventory > 0 ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-none text-xs font-medium bg-success-tint text-brand border border-brand/20">
                <CheckCircle2 className="w-3.5 h-3.5 text-brand" />
                {product.totalInventory} in stock
              </span>
            ) : product.totalInventory === 0 ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-none text-xs font-medium bg-destructive-tint text-destructive border border-destructive/25">
                <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                Out of stock
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-none text-xs font-medium bg-secondary text-muted-foreground border border-border">
                Inventory untracked
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        {product.description && (
          <div className="bg-card border border-border rounded-none p-4 space-y-1.5">
            <span className="text-xs font-semibold text-foreground block uppercase tracking-wider text-[10.5px]">
              Description
            </span>
            <p className="text-xs text-muted-foreground leading-relaxed max-h-32 overflow-y-auto">
              {product.description}
            </p>
          </div>
        )}

        {/* Variants Table */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Available Variants ({product.variants.length})</span>
            </span>
            <span className="text-[11px] text-muted-foreground">
              Total stock: {product.totalInventory ?? "Untracked"}
            </span>
          </div>

          <div className="border border-border rounded-none overflow-hidden divide-y divide-border bg-card">
            {product.variants.map((v) => {
              return (
                <div
                  key={v.id}
                  className="p-3.5 flex items-center justify-between gap-3 text-xs hover:bg-muted transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground truncate">
                        {v.title}
                      </span>
                      {v.sku && (
                        <span className="text-[10px] text-muted-foreground font-mono bg-secondary px-1.5 py-0.5 rounded-none border border-border">
                          SKU: {v.sku}
                        </span>
                      )}
                    </div>

                    {v.selectedOptions && v.selectedOptions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {v.selectedOptions.map((opt, i) => (
                          <span
                            key={i}
                            className="text-[10px] text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-none"
                          >
                            {opt.name}: {opt.value}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Pricing & Stock */}
                  <div className="text-right shrink-0">
                    <div className="flex items-baseline justify-end gap-1.5">
                      <span className="font-semibold text-foreground">
                        {currency} {v.price}
                      </span>
                      {v.compareAtPrice && (
                        <span className="text-[11px] text-muted-foreground line-through">
                          {currency} {v.compareAtPrice}
                        </span>
                      )}
                    </div>

                    <div className="mt-0.5">
                      {v.availableForSale ? (
                        <span className="text-[10.5px] font-medium text-brand inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-brand" />
                          {v.inventoryQuantity !== null
                            ? `${v.inventoryQuantity} in stock`
                            : "Available"}
                        </span>
                      ) : (
                        <span className="text-[10.5px] font-medium text-destructive inline-flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 text-destructive" />
                          Out of stock
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tags */}
        {product.tags && product.tags.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <span className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Tag className="w-3 h-3" />
              Tags
            </span>
            <div className="flex flex-wrap gap-1.5">
              {product.tags.map((tag, i) => (
                <span
                  key={i}
                  className="px-2.5 py-0.5 rounded-none bg-secondary text-foreground text-xs border border-border"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer matching Meta submodal shape */}
      <BaseManagerModalFooter
        leftSlot={
          product.onlineStoreUrl ? (
            <a
              href={product.onlineStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-brand hover:text-brand-hover font-semibold"
            >
              <span>View in Online Store</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          ) : null
        }
        rightSlot={
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-semibold text-foreground hover:text-foreground bg-card hover:bg-muted border border-border rounded-none transition-colors cursor-pointer"
          >
            Back to Products
          </button>
        }
      />
    </BaseManagerModalDialog>
  );
}
