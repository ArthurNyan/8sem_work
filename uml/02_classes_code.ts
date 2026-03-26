/**
 * TypeScript интерфейсы, сгенерированные из диаграммы классов (02_classes.puml)
 * CMS-шаблон на базе Strapi и Astro
 */

// ---------------------------------------------------------------------------
// Базовые типы
// ---------------------------------------------------------------------------

export interface IStrapiBaseEntity {
  id?: number;
  documentId?: string;
  createdAt?: Date;
  updatedAt?: Date;
  publishedAt?: Date | null;
}

export interface ILocalizedEntity {
  locale?: string;
  localizations?: ILocalizedEntity[];
}

export interface IUploadFile {
  id?: number;
  name?: string;
  url?: string;
  mime?: string;
  size?: number;
  width?: number | null;
  height?: number | null;
  alternativeText?: string | null;
  caption?: string | null;
  formats?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Перечисления
// ---------------------------------------------------------------------------

export enum VacancyFormat {
  Remote = "remote",
  Hybrid = "hybrid",
  Office = "office",
}

// ---------------------------------------------------------------------------
// Доменные сущности (Strapi Content Types)
// ---------------------------------------------------------------------------

export interface IArticle extends IStrapiBaseEntity, ILocalizedEntity {
  name: string;
  description: string;
  slug: string;
  date?: Date | null;
  cover: IUploadFile;
  content?: string | null;
  authors?: IAuthor[];
}

export interface IAuthor extends IStrapiBaseEntity, ILocalizedEntity {
  firstName: string;
  lastName: string;
  articles?: IArticle[];
}

export interface IProject extends IStrapiBaseEntity, ILocalizedEntity {
  name: string;
  description: string;
  slug: string;
  cover: IUploadFile;
  logo?: IUploadFile | null;
  date?: Date | null;
  content?: string | null;
}

export interface IVacancy extends IStrapiBaseEntity {
  title: string;
  description?: string | null;
  salary?: string | null;
  location?: string | null;
  active: boolean;
  format: VacancyFormat;
  about?: string | null;
}

export interface IGlobal extends IStrapiBaseEntity, ILocalizedEntity {
  companyName: string;
  description: string;
  logo: IUploadFile;
}

export interface IHomePage extends IStrapiBaseEntity, ILocalizedEntity {
  Title?: string | null;
  description: string;
}

// ---------------------------------------------------------------------------
// Параметры запросов к API
// ---------------------------------------------------------------------------

export interface IStrapiQueryParams {
  populate?: string | string[] | Record<string, unknown>;
  filters?: Record<string, unknown>;
  sort?: string | string[];
  pagination?: {
    page?: number;
    pageSize?: number;
    start?: number;
    limit?: number;
  };
  locale?: string;
}

// ---------------------------------------------------------------------------
// API-клиент
// ---------------------------------------------------------------------------

export interface IStrapiApiClient {
  getArticles(query?: IStrapiQueryParams): Promise<IArticle[]>;
  getArticlesId(documentId: string): Promise<IArticle>;
  getProjects(query?: IStrapiQueryParams): Promise<IProject[]>;
  getProjectsId(documentId: string): Promise<IProject>;
  getVacancies(query?: IStrapiQueryParams): Promise<IVacancy[]>;
}

// ---------------------------------------------------------------------------
// Пропсы компонентов Astro / React
// ---------------------------------------------------------------------------

export interface IArticleCardProps {
  article: IArticle;
  baseUrl?: string;
}

export interface IProjectCardProps {
  project: IProject;
  baseUrl?: string;
}

export interface IVacancyListProps {
  vacancies: IVacancy[];
}
