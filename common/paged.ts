export namespace Paged {
  export interface IRequest {
    pageNumber: number;
    pageSize: number;
  }
  export interface IResponse<T> {
    items: T[];
    totalElements: number;
    totalPages: number;
  }
}
