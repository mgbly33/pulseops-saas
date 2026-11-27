import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Compass, ArrowLeft } from 'lucide-react';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="surface-card max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
          <Compass className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          {t('common.notFoundTitle')}
        </h1>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {t('common.notFoundDesc')}
        </p>
        <Link to="/" className="btn-primary mt-5 inline-flex">
          <ArrowLeft className="h-4 w-4" />
          {t('common.backHome')}
        </Link>
      </div>
    </div>
  );
}
