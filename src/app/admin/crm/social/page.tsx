import { SocialClient } from '@/components/social/SocialClient';
import { DEFAULT_WORKSPACE_ID } from '@/lib/social/constants';

export default function CrmSocialPage() {
  return <SocialClient workspaceId={DEFAULT_WORKSPACE_ID} />;
}