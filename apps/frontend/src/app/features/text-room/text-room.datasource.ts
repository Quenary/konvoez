// import { inject, Injectable } from '@angular/core';
// import { CollectionViewer, DataSource } from '@angular/cdk/collections';
// import { first, Observable, Subscription, withLatestFrom } from 'rxjs';
// import { IMessageWithStatus } from './text-room.reducer';
// import { Store } from '@ngrx/store';
// import {
//   selectMessagesList,
//   selectTextRoomSelectedId,
// } from './text-room.selectors';
// import { TextRoomActions } from './text-room.actions';

// @Injectable()
// export class TextRoomDataSource implements DataSource<IMessageWithStatus> {
//   private readonly store = inject(Store);

//   private length: number = 0;
//   private readonly pageSize = 20;

//   private subscription!: Subscription;

//   connect(
//     collectionViewer: CollectionViewer,
//   ): Observable<IMessageWithStatus[]> {
//     console.log('connected');
//     this.subscription = collectionViewer.viewChange
//       .pipe(withLatestFrom(this.store.select(selectTextRoomSelectedId)))
//       .subscribe(([range, roomId]) => {
//         console.log(range, roomId);
//         const startPage = this.getPageForIndex(range.start);
//         const endPage = this.getPageForIndex(range.end);
//         console.log(startPage, endPage);
//         for (let pageNumber = startPage; pageNumber <= endPage; pageNumber++) {
//           this.store.dispatch(
//             TextRoomActions.requestList({
//               data: {
//                 pageNumber,
//                 pageSize: this.pageSize,
//                 roomId,
//                 recipientId: null,
//               },
//             }),
//           );
//         }
//       });
//     // initial load
//     this.store
//       .select(selectTextRoomSelectedId)
//       .pipe(first((id) => !!id))
//       .subscribe((id) => {
//         this.store.dispatch(
//           TextRoomActions.requestList({
//             data: {
//               pageNumber: 1,
//               pageSize: this.pageSize,
//               roomId: id,
//               recipientId: null,
//             },
//           }),
//         );
//       });
//     return this.store.select(selectMessagesList);
//   }

//   disconnect() {
//     this.subscription?.unsubscribe?.();
//   }

//   private getPageForIndex(index: number): number {
//     return Math.floor(index / this.pageSize) || 1;
//   }
// }
