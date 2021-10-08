import { useState, useEffect } from 'react';
import { BigNumber } from 'ethers';
import { useParams } from 'react-router-dom';
import { Vest } from '../../data/vests';
import { useData } from '../../data';
import useDisplayName from '../../hooks/useDisplayName';
import useDisplayAmount from '../../hooks/useDisplayAmount';

function TokenVest() {
  const params = useParams<{ id: string }>();
  const { loading, vests: { all } } = useData();

  const [vest, setVest] = useState<Vest>();
  useEffect(() => {
    if (!params.id) {
      setVest(undefined);
      return;
    }

    const [token, beneficiary] = params.id.split("-");
    const vest = all.find(vest => vest.token.instance.address === token && vest.beneficiary === beneficiary);
    setVest(vest);
  }, [all, params.id]);

  const [tokenAddress, setTokenAddress] = useState<string>();
  const [creatorAddress, setCreatorAddress] = useState<string>();
  const [beneficiaryAddress, setBeneficiaryAddress] = useState<string>();
  const [decimals, setDecimals] = useState<number>();
  const [totalAmount, setTotalAmount] = useState<BigNumber>();
  const [totalVestedAmount, setTotalVestedAmount] = useState<BigNumber>();
  const [releasedAmount, setReleasedAmount] = useState<BigNumber>();
  const [releasableAmount, setReleasableAmount] = useState<BigNumber>();

  useEffect(() => {
    if (!vest) {
      setTokenAddress(undefined);
      setCreatorAddress(undefined);
      setBeneficiaryAddress(undefined);
      setDecimals(undefined);
      setTotalAmount(undefined);
      setTotalVestedAmount(undefined);
      setReleasedAmount(undefined);
      setReleasableAmount(undefined);
      return;
    }

    setTokenAddress(vest.token.instance.address);
    setCreatorAddress(vest.creator);
    setBeneficiaryAddress(vest.beneficiary);
    setDecimals(vest.token.decimals);
    setTotalAmount(vest.totalAmount);
    setTotalVestedAmount(vest.totalVestedAmount);
    setReleasedAmount(vest.releasedAmount);
    setReleasableAmount(vest.releasableAmount);
  }, [vest]);

  const tokenDisplayName = useDisplayName(tokenAddress);
  const creatorDisplayName = useDisplayName(creatorAddress);
  const beneficiaryDisplayName = useDisplayName(beneficiaryAddress);

  const totalAmountDisplay = useDisplayAmount(totalAmount, decimals);
  const totalVestedAmountDisplay = useDisplayAmount(totalVestedAmount, decimals);
  const releasedAmountDisplay = useDisplayAmount(releasedAmount, decimals);
  const releasableAmountDisplay = useDisplayAmount(releasableAmount, decimals);

  if (!vest) {
    if (loading) {
      return (
        <div>Loading token vest</div>
      );
    } else {
      return (
        <div>Token vest not found</div>
      );
    }
  }

  return (
    <div>
      <div>token: {vest.token.name} ({vest.token.symbol}) {tokenDisplayName}</div>
      <div>creator: {creatorDisplayName}</div>
      <div>beneficiary: {beneficiaryDisplayName}</div>
      <div>start: {vest.start.toLocaleString()}</div>
      <div>end: {vest.end.toLocaleString()}</div>
      <div>total amount: {totalAmountDisplay}</div>
      <div>total vested amount: {totalVestedAmountDisplay}</div>
      <div>released amount: {releasedAmountDisplay}</div>
      <div>releasable amount: {releasableAmountDisplay}</div>
    </div>
  );
}

export default TokenVest;
