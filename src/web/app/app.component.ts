import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { HttpClientModule } from '@angular/common/http';
import { Observable, Subject, filter, first, map } from 'rxjs';
import { ApiService } from '../../lib/api';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, HttpClientModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  private count = new Subject<number>();

  title = 'web';

  count$ = this.count.asObservable();

  openApiDocs$: Observable<string>;

  constructor(private apiService: ApiService) {
    this.openApiDocs$ = this.apiService
      .health()
      .pipe(map((health) => health.hrefs.openApiDocs));
  }

  ngOnInit(): void {
    this.apiService
      .getCount()
      .pipe(
        first(),
        filter((count) => !!count),
        map((count) => {
          this.count.next(count.count);
        }),
      )
      .subscribe();
  }

  increment(): void {
    this.apiService
      .incrementCount()
      .pipe(map((count) => this.count.next(count.count)))
      .subscribe();
  }
}
