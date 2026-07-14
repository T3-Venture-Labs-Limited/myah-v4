import { Img } from '@react-email/components';

const logoStyle = {
  marginBottom: '40px',
};

export const Logo = () => {
  return (
    <Img
      src="https://app.myah.dev/images/brand/myah-mark.png"
      alt="Myah logo"
      width="40"
      height="40"
      style={logoStyle}
    />
  );
};
