import { ThirdPartyNoticesPage } from './ThirdPartyNoticesPage';
import { ThemeContextProvider } from '../providers/ThemeContextProvider';

interface IThirdPartyNoticesRouteProps {
  onBack: () => void;
}

export function ThirdPartyNoticesRoute({ onBack }: IThirdPartyNoticesRouteProps) {
  return (
    <ThemeContextProvider>
      <ThirdPartyNoticesPage onBack={onBack} />
    </ThemeContextProvider>
  );
}
