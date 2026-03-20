import {getRequestConfig} from "next-intl/server";

import {routing} from "../i18n";

export default getRequestConfig(async ({requestLocale}) => {
  const locale = (await requestLocale) ?? routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});

