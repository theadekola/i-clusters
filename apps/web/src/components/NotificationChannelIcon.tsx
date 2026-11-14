import {notificationChannels} from '../notification-channels';
import BrandIcon from './BrandIcon';

export default function NotificationChannelIcon({channel,size=22}:{channel:string;size?:number}){
 if(channel==='discord'||channel==='telegram')return <BrandIcon brand={channel} size={size}/>;
 if(!notificationChannels.includes(channel))return null;
 return <img className={`notification-channel-image ${channel}`} src={`/assets/notifications/${channel}.svg`} alt="" width={size} height={size}/>;
}
