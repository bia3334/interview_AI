import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { AppModule } from './app/app.module';

console.log('Angular: Starting bootstrap...');
platformBrowserDynamic().bootstrapModule(AppModule)
  .then(() => {
    console.log('Angular: Bootstrap successful!');
  })
  .catch(err => {
    console.error('Angular: Bootstrap failed!', err);
  });

