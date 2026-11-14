import {Link} from 'react-router-dom';
import {PageHeader} from '../components/UI';
import AlertNotifications from './AlertNotifications';
import './delivery-history.css';

export default function DeliveryHistory(){
 return <section className="delivery-history-page">
  <PageHeader title="Delivery History" subtitle="Filter and inspect recorded delivery attempts." actions={<Link className="btn primary" to="/settings?tab=Integrations">Back to Integrations</Link>}/>
  <AlertNotifications owner embedded/>
 </section>;
}
