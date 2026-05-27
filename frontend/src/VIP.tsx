import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface Props {
  onClose: () => void;
}

export function VIP({ onClose }: Props) {
  const navigate = useNavigate();

  useEffect(() => {
    onClose();
    navigate('/pricing', { replace: true });
  }, [navigate, onClose]);

  return null;
}

export default VIP;
