export interface ScrapperData {
  scraping_config: ScrapingConfig[];
  global_settings: GlobalSettings;
}

export interface GlobalSettings {
  output: Output;
  request_delay: number;
  user_agent: string;
}

export interface Output {
  format: string;
  file_name: string;
}

export interface ScrapingConfig {
  website_name: string;
  website_url: string;
  elementList: TargetElement;
  target_elements: TargetElement[];
  pagination: Pagination;
  popup: Popup;
  linkUrl: LinkUrl;
  protocol?: string;
}

export interface Pagination {
  enabled: boolean;
  next_page_selector?: string;
  max_pages?: number;
  pages_url?: string;
}

export interface LinkUrl {
  isRequired: boolean;
  url?: string;
}

export interface Popup {
  enabled: boolean;
  button_close_selector?: string;
}

export interface TargetElement {
  element_name: string;
  selector: string;
  attribute: string;
}
