import { ScrapperData } from "@modules/scrapper/interfaces";

export const scrapperModel: ScrapperData = {
  scraping_config: [
    {
      website_name: "Cosmetic",
      website_url: "https://cosmetic.cl/collections/perfumes",
      elementList: {
        element_name: "products",
        selector: "div.ProductItem",
        attribute: "list",
      },
      target_elements: [
        {
          element_name: "brand",
          selector: "p.ProductItem__Vendor.Heading",
          attribute: "text",
        },
        {
          element_name: "product",
          selector: ".ProductItem__Title.Heading",
          attribute: "text",
        },
        {
          element_name: "price",
          selector: "span.ProductItem__Price.Price.Text--subdued",
          attribute: "price",
        },
        {
          element_name: "product_link",
          selector: "a.ProductItem__ImageWrapper",
          attribute: "href",
        },
        {
          element_name: "image",
          selector:
            ".ProductItem__Image.Image--fadeIn.lazyautosizes.Image--lazyLoaded",
          attribute: "src",
        },
      ],
      pagination: {
        enabled: false,
      },
      popup: {
        enabled: true,
        button_close_selector:
          ".needsclick.klaviyo-close-form.go4255485812.kl-private-reset-css-Xuajs1",
      },
      linkUrl: {
        isRequired: true,
        url: "https://cosmetic.cl",
      },
    },
    {
      website_name: "Mz Perfumes",
      website_url: "https://mzperfumes.cl/tienda/",
      elementList: {
        element_name: "products",
        selector: ".product-grid-item",
        attribute: "list",
      },
      target_elements: [
        {
          element_name: "product",
          selector: "h3.wd-entities-title",
          attribute: "text",
        },
        {
          element_name: "price",
          selector: "span.price",
          attribute: "price",
        },
        {
          element_name: "product_link",
          selector: "a.product-image-link",
          attribute: "href",
        },
        {
          element_name: "sold_out",
          selector: "span.out-of-stock.product-label",
          attribute: "text",
        },
        {
          element_name: "image",
          selector:
            ".attachment-woocommerce_thumbnail.size-woocommerce_thumbnail",
          attribute: "src",
        },
      ],
      pagination: {
        enabled: true,
        next_page_selector: "a.next",
        max_pages: 64,
        pages_url: "https://mzperfumes.cl/tienda/page",
      },
      popup: {
        enabled: false,
      },
      linkUrl: {
        isRequired: false,
      },
    },
    {
      website_name: "Comprar en Chile",
      website_url: "https://comprarenchile.cl/collections/todos-los-perfumes",
      elementList: {
        element_name: "products",
        selector: ".product-item",
        attribute: "list",
      },
      target_elements: [
        {
          element_name: "product",
          selector: ".product-item-meta__title",
          attribute: "text",
        },
        {
          element_name: "price",
          selector: "span.price",
          attribute: "price",
        },
        {
          element_name: "product_link",
          selector:
            "a.product-item__aspect-ratio.aspect-ratio.aspect-ratio--square",
          attribute: "href",
        },
        {
          element_name: "image",
          selector: ".product-item__primary-image",
          attribute: "src",
        },
      ],
      pagination: {
        enabled: true,
        next_page_selector: "a.pagination__nav-item[rel='next']",
        max_pages: 43,
        pages_url:
          "https://comprarenchile.cl/collections/todos-los-perfumes?page=",
      },
      popup: {
        enabled: false,
      },
      linkUrl: {
        isRequired: true,
        url: "https://comprarenchile.cl",
      },
      protocol: "https:",
    },
  ],
  global_settings: {
    output: {
      format: "json",
      file_name: "multi_site_scraped_data.json",
    },
    request_delay: 2000,
    user_agent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  },
};
