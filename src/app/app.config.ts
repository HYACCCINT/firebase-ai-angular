import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { initializeApp, provideFirebaseApp, getApp } from '@angular/fire/app';
import {
  ReCaptchaEnterpriseProvider,
  initializeAppCheck,
  provideAppCheck,
} from '@angular/fire/app-check';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { environment } from '../environments/environments';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

declare global {
  var FIREBASE_APPCHECK_DEBUG_TOKEN: string;
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideFirebaseApp(() =>
      initializeApp(environment.firebase)
    ),
    // Turn on app check for Vertex AI in Firebase
    // provideAppCheck(() => {
      // TODO: don't use debug token in prod
      // self.FIREBASE_APPCHECK_DEBUG_TOKEN = environment.debug_token;

      // const appCheck = initializeAppCheck(getApp(), {
      //   provider: new ReCaptchaEnterpriseProvider("your site key here"),
      //   isTokenAutoRefreshEnabled: true,
      // });
      // return appCheck;
    // }),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()), provideAnimationsAsync(),
  ],
};
