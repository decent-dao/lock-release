import { Link, useRouteMatch } from 'react-router-dom';
import { useWeb3 } from '../../web3';
import Emoji from '../ui/Emoji';

function MenuItem({
  emoji,
  title,
  to,
}: {
  emoji: string,
  title: string,
  to: string,
}) {
  const match = useRouteMatch(to);

  return (
    <Link to={to} className={`py-2 sm:pr-4 text-right flex flex-col items-center sm:block ${match ? "active-link" : ""}`}>
      <Emoji emoji={emoji} />
      <div className="hidden sm:block">{title}</div>
    </Link>
  );
}

function Separator() {
  return (
    <div className="border-b pt-2 mb-2" />
  );
}

function Menu() {
  const { account } = useWeb3();

  return (
    <div className="-my-2">
      {account && (
        <div>
          <MenuItem
            emoji="⏲"
            title="create new vest"
            to="/vests/new"
          />
          <Separator />
        </div>
      )}
      <MenuItem
        emoji="👨‍👩‍👧‍👦"
        title="all vests"
        to="/vests/all"
      />
      {account && (
        <div>
          <MenuItem
            emoji="🤑"
            title="my vests"
            to="/vests/my"
          />
          <MenuItem
            emoji="🎨"
            title="my created vests"
            to="/vests/my-created"
          />
        </div>
      )}
    </div>
  );
}

export default Menu;
