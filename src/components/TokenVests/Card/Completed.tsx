import { Vest } from '../../../data/vests';
import { Property } from '../../ui/Properties';

function Completed({
  vest,
}: {
  vest: Vest,
}) {
  return (
    <div>
      <Property title="ended on">
        <div>{new Date(vest.end * 1000).toLocaleString()}</div>
      </Property>
    </div>
  );
}

export default Completed;